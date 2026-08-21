const { Order, User, Product, ProductImage, OrderItem, AdminLog } = require('../models');


// @desc    Get Central Admin Dashboard Stats
// @route   GET /api/dashboard/stats
// @access  Private
const getDashboardStats = async (req, res, next) => {
  try {
    // ─── Date helpers ────────────────────────────────────────────────────
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // ─── 1. General Widget Metrics ───────────────────────────────────────
    const totalOrdersCount = await Order.countDocuments();

    const paidOrdersSum = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalSalesSum = paidOrdersSum.length > 0 ? paidOrdersSum[0].total : 0;

    const totalCustomersCount = await User.countDocuments({ status: 'active' });
    const totalProductsCount  = await Product.countDocuments();

    // ─── 2. Month-over-Month Trends ──────────────────────────────────────
    // Revenue: this month vs last month (paid orders only)
    const [thisMonthRevAgg, lastMonthRevAgg] = await Promise.all([
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startOfThisMonth } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      Order.aggregate([
        { $match: { paymentStatus: 'paid', createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ])
    ]);
    const thisMonthRevenue = thisMonthRevAgg[0]?.total || 0;
    const lastMonthRevenue = lastMonthRevAgg[0]?.total || 0;
    const revenueTrend = lastMonthRevenue > 0
      ? parseFloat(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1))
      : null;

    // Orders: this month vs last month
    const [thisMonthOrders, lastMonthOrders] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
      Order.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } })
    ]);
    const ordersTrend = lastMonthOrders > 0
      ? parseFloat(((thisMonthOrders - lastMonthOrders) / lastMonthOrders * 100).toFixed(1))
      : null;

    // New customers: this month vs last month
    const [thisMonthCustomers, lastMonthCustomers] = await Promise.all([
      User.countDocuments({ status: 'active', createdAt: { $gte: startOfThisMonth } }),
      User.countDocuments({ status: 'active', createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } })
    ]);
    const customersTrend = lastMonthCustomers > 0
      ? parseFloat(((thisMonthCustomers - lastMonthCustomers) / lastMonthCustomers * 100).toFixed(1))
      : null;

    // ─── 3. Quick Insight Metrics ────────────────────────────────────────
    // AOV
    const aov = totalOrdersCount > 0 ? parseFloat((totalSalesSum / totalOrdersCount).toFixed(2)) : 0;

    // Fulfillment rate: % of orders that are delivered
    const deliveredCount = await Order.countDocuments({ orderStatus: 'delivered' });
    const fulfillmentRate = totalOrdersCount > 0
      ? parseFloat(((deliveredCount / totalOrdersCount) * 100).toFixed(1))
      : 0;

    // Pending orders
    const pendingOrders = await Order.countDocuments({ orderStatus: 'pending' });

    // Low stock count
    const lowStockCount = await Product.countDocuments({ stockQuantity: { $lte: 10 } });

    // ─── 4. Low Stock Alert Products (stock <= 10) ───────────────────────
    const lowStockAlerts = await Product.find({ stockQuantity: { $lte: 10 } })
      .select('id name sku stockQuantity price thumbnail')
      .limit(10);

    // ─── 5. Top Selling Products ─────────────────────────────────────────
    const topSellersAgg = await OrderItem.aggregate([
      {
        $group: {
          _id: '$product',
          productName: { $first: '$productName' },
          sku:         { $first: '$sku' },
          totalSold:   { $sum: '$quantity' },
          totalRevenue:{ $sum: { $multiply: ['$quantity', '$price'] } }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 }
    ]);

    const topSellers = await Promise.all(topSellersAgg.map(async (item) => {
      let thumbnail = null;
      if (item._id) {
        try {
          const productDetails = await Product.findById(item._id).select('thumbnail').lean();
          if (productDetails) {
            thumbnail = productDetails.thumbnail || null;
          }
          // Fallback: try to get first gallery image if thumbnail is empty
          if (!thumbnail) {
            const firstImg = await ProductImage.findOne({ product: item._id }).select('imageUrl').lean();
            if (firstImg) thumbnail = firstImg.imageUrl;
          }
        } catch (e) {
          // product may have been deleted — thumbnail stays null
        }
      }
      return {
        productId:    item._id,
        productName:  item.productName,
        sku:          item.sku,
        totalSold:    item.totalSold,
        totalRevenue: parseFloat(item.totalRevenue.toFixed(2)),
        product: thumbnail ? { thumbnail } : null
      };
    }));

    // ─── 6. Latest 5 Orders ──────────────────────────────────────────────
    const latestOrdersDocs = await Order.find()
      .select('id orderNumber totalAmount orderStatus createdAt user')
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(5);

    const latestOrders = latestOrdersDocs.map(order => ({
      id:          order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      orderStatus: order.orderStatus,
      createdAt:   order.createdAt,
      user:        order.user
    }));

    // ─── 7. Monthly Sales Chart (Last 6 Months) ──────────────────────────
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const ordersForChart = await Order.find({
      createdAt: { $gte: sixMonthsAgo },
      paymentStatus: 'paid'
    }).select('totalAmount createdAt').sort({ createdAt: 1 });

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const chartDataMap = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${months[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`;
      chartDataMap[key] = { month: key, sales: 0, orders: 0 };
    }
    ordersForChart.forEach(order => {
      const date = new Date(order.createdAt);
      const key = `${months[date.getMonth()]} ${date.getFullYear().toString().substring(2)}`;
      if (chartDataMap[key]) {
        chartDataMap[key].sales += parseFloat(order.totalAmount);
        chartDataMap[key].orders += 1;
      }
    });
    const monthlySalesChart = Object.values(chartDataMap).map(c => ({
      ...c,
      sales: parseFloat(c.sales.toFixed(2))
    }));

    // ─── 8. Recent Admin Activity Logs ───────────────────────────────────
    const recentActivity = await AdminLog.find()
      .select('id action entityType createdAt')
      .sort({ createdAt: -1 })
      .limit(8);

    res.json({
      success: true,
      data: {
        widgets: {
          totalSales:     parseFloat(totalSalesSum.toFixed(2)),
          totalOrders:    totalOrdersCount,
          totalCustomers: totalCustomersCount,
          totalProducts:  totalProductsCount,
          // Real month-over-month trends (null = no prior month data)
          revenueTrend,
          ordersTrend,
          customersTrend,
          // Quick insights
          aov,
          fulfillmentRate,
          pendingOrders,
          lowStockCount,
          thisMonthRevenue:  parseFloat(thisMonthRevenue.toFixed(2)),
          thisMonthOrders,
          thisMonthCustomers
        },
        lowStock: lowStockAlerts,
        topProducts: topSellers,
        latestOrders,
        monthlySalesChart,
        recentActivity
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats
};
