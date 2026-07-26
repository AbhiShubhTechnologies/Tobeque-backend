const nodemailer = require('nodemailer');

// ─────────────────────────────────────────────
//  Create Nodemailer Transporter
// ─────────────────────────────────────────────
const createTransporter = () => {
  const config = {
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  };

  if (process.env.SMTP_SERVICE) {
    config.service = process.env.SMTP_SERVICE;
  } else {
    config.host = process.env.SMTP_HOST || 'smtp.gmail.com';
    config.port = parseInt(process.env.SMTP_PORT) || 587;
    config.secure = parseInt(process.env.SMTP_PORT) === 465;
  }
  
  return nodemailer.createTransport(config);
};

// ─────────────────────────────────────────────
//  Format Currency
// ─────────────────────────────────────────────
const formatCurrency = (amount) => {
  const num = parseFloat(amount) || 0;
  return '₹' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// ─────────────────────────────────────────────
//  Format Date
// ─────────────────────────────────────────────
const formatDate = (dateStr) => {
  const date = dateStr ? new Date(dateStr) : new Date();
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

// ─────────────────────────────────────────────
//  Format Payment Method Label
// ─────────────────────────────────────────────
const formatPaymentMethod = (method) => {
  const map = {
    cod: 'Cash on Delivery',
    online: 'Online Payment',
    card: 'Credit / Debit Card',
    upi: 'UPI',
    netbanking: 'Net Banking',
    wallet: 'Wallet'
  };
  return map[(method || '').toLowerCase()] || method || 'N/A';
};

// ─────────────────────────────────────────────
//  Format Address Object
// ─────────────────────────────────────────────
const formatAddress = (addr) => {
  if (!addr) return 'N/A';
  if (typeof addr === 'string') {
    try { addr = JSON.parse(addr); } catch (e) { return addr; }
  }
  const lines = [
    addr.name,
    addr.company,
    addr.street || addr.address,
    addr.street2,
    [addr.city, addr.state, addr.zip || addr.zipCode].filter(Boolean).join(', '),
    addr.country
  ].filter(Boolean);
  return lines.join('<br>');
};

// ─────────────────────────────────────────────
//  Generate Invoice Items HTML Rows
// ─────────────────────────────────────────────
const generateItemRows = (items = []) => {
  if (!items || items.length === 0) {
    return `<tr>
      <td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;">No items found</td>
    </tr>`;
  }

  return items.map((item, index) => {
    const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    const variantText = item.variantDetails
      ? Object.entries(typeof item.variantDetails === 'string'
          ? JSON.parse(item.variantDetails)
          : item.variantDetails)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ')
      : '';

    const itemTotal = (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1);

    return `
    <tr style="background:${bg};">
      <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;vertical-align:top;">
        <strong style="display:block;margin-bottom:3px;">${item.productName || 'Product'}</strong>
        ${variantText ? `<span style="font-size:12px;color:#64748b;">${variantText}</span>` : ''}
        ${item.sku ? `<span style="font-size:11px;color:#94a3b8;display:block;margin-top:2px;">SKU: ${item.sku}</span>` : ''}
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#475569;text-align:center;vertical-align:top;">
        ${item.quantity || 1}
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#475569;text-align:right;vertical-align:top;">
        ${formatCurrency(item.price)}
        ${item.taxRate ? `<span style="display:block;font-size:11px;color:#94a3b8;">excl. GST</span>` : ''}
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:600;text-align:right;vertical-align:top;">
        ${formatCurrency(itemTotal)}
      </td>
    </tr>`;
  }).join('');
};

// ─────────────────────────────────────────────
//  Build Full HTML Email Template
// ─────────────────────────────────────────────
const buildInvoiceHTML = ({ order, user, items = [] }) => {
  const firstName = user?.firstName || order?.billingAddress?.name?.split(' ')[0] || 'Valued Customer';
  const isCOD = (order.paymentMethod || '').toLowerCase() === 'cod';
  const paymentBadgeColor = isCOD ? '#f59e0b' : '#10b981';
  const paymentBadgeBg   = isCOD ? '#fffbeb' : '#ecfdf5';
  const orderDate = formatDate(order.createdAt);
  const billingAddr  = formatAddress(order.billingAddress);
  const shippingAddr = formatAddress(order.shippingAddress);
  
  const itemsTax = items.reduce((sum, item) => sum + (parseFloat(item.taxAmount) || 0), 0);
  const subtotal     = parseFloat(order.subtotal) || 0;
  const taxAmount    = parseFloat(order.taxAmount) !== undefined && parseFloat(order.taxAmount) !== null ? parseFloat(order.taxAmount) : itemsTax;
  const shippingCost = parseFloat(order.shippingCost !== undefined ? order.shippingCost : (order.shippingFee || 0));
  const discount     = parseFloat(order.discountAmount) || 0;
  const total        = parseFloat(order.totalAmount) || 0;

  const itemsHTML = generateItemRows(items);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation — ${order.orderNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Email Card -->
        <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- ══════════════════════════════════
               HEADER
          ══════════════════════════════════ -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#0f2744 100%);padding:0;position:relative;">
              <!-- Top decorative strip -->
              <div style="height:4px;background:linear-gradient(90deg,#f59e0b,#fbbf24,#f59e0b);"></div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:40px 40px 36px;text-align:center;">
                    <!-- Brand Name -->
                    <div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#ffffff;text-transform:uppercase;margin-bottom:6px;font-family:'Georgia',serif;">
                      TOBEQUE
                    </div>
                    <div style="width:48px;height:2px;background:#f59e0b;margin:0 auto 20px;border-radius:2px;"></div>
                    <!-- Checkmark Icon -->
                    <div style="width:56px;height:56px;background:rgba(245,158,11,0.15);border:2px solid rgba(245,158,11,0.4);border-radius:50%;margin:0 auto 16px;display:table;text-align:center;line-height:52px;font-size:24px;">
                      ✓
                    </div>
                    <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">
                      Thank You for Your Order!
                    </h1>
                    <p style="margin:10px 0 0;font-size:14px;color:#94a3b8;letter-spacing:0.3px;">
                      Your order has been received and is being processed
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════════════════════════════════
               ORDER META BADGES
          ══════════════════════════════════ -->
          <tr>
            <td style="background:#0f172a;padding:0 40px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <!-- Order # Badge -->
                        <td style="padding:0 6px;">
                          <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:12px 20px;text-align:center;">
                            <div style="font-size:10px;color:#64748b;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">Order Number</div>
                            <div style="font-size:15px;color:#f8fafc;font-weight:700;letter-spacing:0.5px;">#${order.orderNumber}</div>
                          </div>
                        </td>
                        <!-- Date Badge -->
                        <td style="padding:0 6px;">
                          <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:12px 20px;text-align:center;">
                            <div style="font-size:10px;color:#64748b;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">Order Date</div>
                            <div style="font-size:15px;color:#f8fafc;font-weight:700;">${orderDate}</div>
                          </div>
                        </td>
                        <!-- Payment Badge -->
                        <td style="padding:0 6px;">
                          <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:12px 20px;text-align:center;">
                            <div style="font-size:10px;color:#64748b;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">Payment</div>
                            <div style="font-size:13px;color:${paymentBadgeColor};font-weight:700;">${formatPaymentMethod(order.paymentMethod)}</div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════════════════════════════════
               GREETING
          ══════════════════════════════════ -->
          <tr>
            <td style="padding:36px 40px 0;">
              <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0f172a;">Hi ${firstName},</p>
              <p style="margin:0;font-size:14px;color:#475569;line-height:1.7;">
                We've successfully received your order and it's now being processed. 
                ${isCOD
                  ? 'Please keep the payment ready at the time of delivery.'
                  : 'Your payment has been confirmed and your order is on its way to being dispatched.'
                }
              </p>
              ${order.notes ? `
              <div style="margin-top:16px;padding:14px 16px;background:#fefce8;border-left:4px solid #f59e0b;border-radius:4px;">
                <span style="font-size:12px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Your Note: </span>
                <span style="font-size:13px;color:#78350f;">${order.notes}</span>
              </div>` : ''}
            </td>
          </tr>

          <!-- ══════════════════════════════════
               SECTION DIVIDER — ITEMS
          ══════════════════════════════════ -->
          <tr>
            <td style="padding:28px 40px 0;">
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:1px;">🛍 Order Items</span>
                <div style="flex:1;height:1px;background:#e2e8f0;margin-left:8px;"></div>
              </div>
            </td>
          </tr>

          <!-- ══════════════════════════════════
               ITEMS TABLE
          ══════════════════════════════════ -->
          <tr>
            <td style="padding:16px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
                <!-- Table Header -->
                <thead>
                  <tr style="background:#0f172a;">
                    <th style="padding:12px 16px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:1.2px;text-transform:uppercase;">Product</th>
                    <th style="padding:12px 16px;text-align:center;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:1.2px;text-transform:uppercase;">Qty</th>
                    <th style="padding:12px 16px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:1.2px;text-transform:uppercase;">Unit Price</th>
                    <th style="padding:12px 16px;text-align:right;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:1.2px;text-transform:uppercase;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHTML}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- ══════════════════════════════════
               ORDER SUMMARY
          ══════════════════════════════════ -->
          <tr>
            <td style="padding:16px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
                <tr style="background:#f8fafc;">
                  <td style="padding:13px 20px;font-size:14px;color:#475569;border-bottom:1px solid #e2e8f0;">Subtotal</td>
                  <td style="padding:13px 20px;font-size:14px;color:#1e293b;text-align:right;border-bottom:1px solid #e2e8f0;">${formatCurrency(subtotal)}</td>
                </tr>
                ${discount > 0 ? `
                <tr style="background:#ffffff;">
                  <td style="padding:13px 20px;font-size:14px;color:#10b981;border-bottom:1px solid #e2e8f0;">
                    Discount ${order.couponCode ? `<span style="font-size:12px;background:#dcfce7;color:#059669;padding:2px 8px;border-radius:20px;margin-left:8px;">${order.couponCode}</span>` : ''}
                  </td>
                  <td style="padding:13px 20px;font-size:14px;color:#10b981;text-align:right;border-bottom:1px solid #e2e8f0;">- ${formatCurrency(discount)}</td>
                </tr>` : ''}
                <tr style="background:#f8fafc;">
                  <td style="padding:13px 20px;font-size:14px;color:#475569;border-bottom:1px solid #e2e8f0;">GST / Tax</td>
                  <td style="padding:13px 20px;font-size:14px;color:#1e293b;text-align:right;border-bottom:1px solid #e2e8f0;">${formatCurrency(taxAmount)}</td>
                </tr>
                <tr style="background:#ffffff;">
                  <td style="padding:13px 20px;font-size:14px;color:#475569;border-bottom:1px solid #e2e8f0;">Shipping</td>
                  <td style="padding:13px 20px;font-size:14px;color:${shippingCost === 0 ? '#10b981' : '#1e293b'};text-align:right;border-bottom:1px solid #e2e8f0;">
                    ${shippingCost === 0 ? '🎉 Free Shipping' : formatCurrency(shippingCost)}
                  </td>
                </tr>
                <tr style="background:#f8fafc;">
                  <td style="padding:13px 20px;font-size:14px;color:#475569;border-bottom:1px solid #e2e8f0;">Payment Method</td>
                  <td style="padding:13px 20px;text-align:right;border-bottom:1px solid #e2e8f0;">
                    <span style="font-size:13px;font-weight:600;color:${paymentBadgeColor};background:${paymentBadgeBg};padding:4px 12px;border-radius:20px;border:1px solid ${paymentBadgeColor}22;">
                      ${formatPaymentMethod(order.paymentMethod)}
                    </span>
                  </td>
                </tr>
                <!-- Total Row -->
                <tr style="background:#0f172a;">
                  <td style="padding:16px 20px;font-size:16px;font-weight:700;color:#ffffff;">Total Amount</td>
                  <td style="padding:16px 20px;font-size:18px;font-weight:800;color:#f59e0b;text-align:right;letter-spacing:0.5px;">${formatCurrency(total)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════════════════════════════════
               ADDRESSES
          ══════════════════════════════════ -->
          <tr>
            <td style="padding:28px 40px 0;">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                <span style="font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:1px;">📦 Delivery Details</span>
                <div style="flex:1;height:1px;background:#e2e8f0;margin-left:8px;"></div>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="50%" style="padding-right:8px;vertical-align:top;">
                    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:20px;background:#f8fafc;height:100%;">
                      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px;">🏠 Billing Address</div>
                      <div style="font-size:13px;color:#334155;line-height:1.8;">${billingAddr}</div>
                    </div>
                  </td>
                  <td width="50%" style="padding-left:8px;vertical-align:top;">
                    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:20px;background:#f8fafc;height:100%;">
                      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:12px;">🚚 Shipping Address</div>
                      <div style="font-size:13px;color:#334155;line-height:1.8;">${shippingAddr}</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══════════════════════════════════
               HELP CTA
          ══════════════════════════════════ -->
          <tr>
            <td style="padding:28px 40px 0;">
              <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);border-radius:12px;padding:24px 28px;text-align:center;">
                <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#ffffff;">Need Help with Your Order?</p>
                <p style="margin:0 0 16px;font-size:13px;color:#94a3b8;">Our support team is always happy to assist you.</p>
                <a href="mailto:info@tobeque.com" style="display:inline-block;background:#f59e0b;color:#0f172a;font-size:13px;font-weight:700;padding:10px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">Contact Support</a>
              </div>
            </td>
          </tr>

          <!-- ══════════════════════════════════
               FOOTER
          ══════════════════════════════════ -->
          <tr>
            <td style="padding:32px 40px;text-align:center;border-top:1px solid #e2e8f0;margin-top:32px;">
              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">
                Thank you for shopping with <a href="https://tobeque.com" style="color:#f59e0b;text-decoration:none;font-weight:600;">Tobeque</a> 🙏
              </p>
              <p style="margin:0;font-size:12px;color:#cbd5e1;">
                © ${new Date().getFullYear()} Tobeque. All rights reserved. &nbsp;|&nbsp;
                <a href="https://tobeque.com" style="color:#64748b;text-decoration:none;">tobeque.com</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- End Email Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;
};

// ─────────────────────────────────────────────
//  Build Plain-Text Fallback
// ─────────────────────────────────────────────
const buildPlainText = ({ order, user, items }) => {
  const firstName = user?.firstName || 'Valued Customer';
  const isCOD = (order.paymentMethod || '').toLowerCase() === 'cod';

  let text = `TOBEQUE — ORDER CONFIRMATION\n`;
  text += `================================\n\n`;
  text += `Hi ${firstName},\n\n`;
  text += `Thank you for your order! We've received your order #${order.orderNumber} and it's now being processed.\n`;
  if (isCOD) text += `Please keep the payment ready at the time of delivery.\n`;
  text += `\nOrder Date: ${formatDate(order.createdAt)}\n`;
  text += `Payment: ${formatPaymentMethod(order.paymentMethod)}\n\n`;
  text += `ITEMS\n-----\n`;
  (items || []).forEach(item => {
    text += `• ${item.productName} x${item.quantity} — ${formatCurrency(item.price * item.quantity)}\n`;
  });
  text += `\nSubtotal: ${formatCurrency(order.subtotal)}\n`;
  if (order.discountAmount > 0) text += `Discount: -${formatCurrency(order.discountAmount)}\n`;
  text += `GST/Tax: ${formatCurrency(order.taxAmount)}\n`;
  text += `Shipping: ${parseFloat(order.shippingCost) === 0 ? 'Free' : formatCurrency(order.shippingCost)}\n`;
  text += `TOTAL: ${formatCurrency(order.totalAmount)}\n\n`;
  text += `Thanks for shopping with Tobeque!\nhttps://tobeque.com\n`;
  return text;
};

// ─────────────────────────────────────────────
//  Main Export: Send Order Confirmation Email
// ─────────────────────────────────────────────
const sendOrderConfirmationEmail = async (order, user, items = []) => {
  try {
    // Determine recipient email
    const toEmail = user?.email;
    if (!toEmail || toEmail.endsWith('@guest.local')) {
      console.log(`[Email] Skipping — no valid email for user ${user?.id || 'unknown'}`);
      return { success: false, reason: 'No valid email address' };
    }

    // Skip if SMTP not configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('[Email] SMTP_USER or SMTP_PASS not set in .env — skipping email send');
      return { success: false, reason: 'SMTP not configured' };
    }

    const transporter = createTransporter();

    const subject = `Official Tax Invoice & Order Confirmation — Order #${order.orderNumber} 📄`;

    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'Tobeque'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: toEmail,
      subject,
      text: buildPlainText({ order, user, items }),
      html: buildInvoiceHTML({ order, user, items })
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] ✅ Order confirmation sent to ${toEmail} — Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email] ❌ Failed to send order confirmation:`, err.message);
    return { success: false, error: err.message };
  }
};

module.exports = {
  sendOrderConfirmationEmail
};
