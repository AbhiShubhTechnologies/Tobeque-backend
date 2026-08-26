/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Shiprocket API Service Utility
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles:
 *   - Token generation & automatic refresh (tokens expire in 24h)
 *   - Order creation on Shiprocket
 *   - Courier serviceability check
 *   - Assign courier & generate AWB
 *   - Schedule pickup
 *   - Generate shipping label URL
 *   - Track shipment
 *   - Cancel shipment
 *   - Rate calculator
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT: Add your credentials to .env before using:
 *   SHIPROCKET_EMAIL=your_api_user_email@example.com
 *   SHIPROCKET_PASSWORD=your_api_user_password
 *   SHIPROCKET_PICKUP_PINCODE=380015
 * ─────────────────────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

// ─── In-memory token cache & auth cool-off ──────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = null; // UTC ms timestamp
let lastAuthError = null;
let authErrorTimestamp = 0;
const AUTH_COOLOFF_MS = 2 * 60 * 1000; // 2 minute cool-off on auth failure to avoid spamming Shiprocket & resetting lock

const mongoose = require('mongoose');

/**
 * Explicitly clear cached token and auth error cool-off.
 * Called when credentials are saved/updated in Admin Settings or during connection test.
 */
const clearShiprocketTokenCache = () => {
  cachedToken = null;
  tokenExpiresAt = null;
  lastAuthError = null;
  authErrorTimestamp = 0;
  console.log('[Shiprocket] 🔄 Token cache and authentication cool-off cleared.');
};

// Helper to resolve Shiprocket configuration from DB Settings or process.env
const getShiprocketConfig = async () => {
  let email = process.env.SHIPROCKET_EMAIL;
  let password = process.env.SHIPROCKET_PASSWORD;
  let pickupPincode = process.env.SHIPROCKET_PICKUP_PINCODE;
  let pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION;

  try {
    const Setting = mongoose.models.Setting || require('../models/setting');
    const settings = await Setting.find({
      key: { $in: ['shiprocketEmail', 'shiprocketPassword', 'shiprocketPickupPincode', 'shiprocketPickupLocation'] }
    });
    const map = {};
    settings.forEach((s) => { map[s.key] = s.value; });

    if (map.shiprocketEmail !== undefined && map.shiprocketEmail !== null && String(map.shiprocketEmail).trim() !== '') {
      email = map.shiprocketEmail;
    }
    if (map.shiprocketPassword !== undefined && map.shiprocketPassword !== null && String(map.shiprocketPassword).trim() !== '') {
      password = map.shiprocketPassword;
    }
    if (map.shiprocketPickupPincode !== undefined && map.shiprocketPickupPincode !== null && String(map.shiprocketPickupPincode).trim() !== '') {
      pickupPincode = map.shiprocketPickupPincode;
    }
    if (map.shiprocketPickupLocation !== undefined && map.shiprocketPickupLocation !== null && String(map.shiprocketPickupLocation).trim() !== '') {
      pickupLocation = map.shiprocketPickupLocation;
    }
  } catch (err) {
    // Ignore DB fetch failure and fallback to env
  }

  return {
    email: (email || '').trim(),
    password: (password || '').trim(),
    pickupPincode: (pickupPincode || '380015').trim(),
    pickupLocation: (pickupLocation || 'Primary').trim()
  };
};

/**
 * Authenticate with Shiprocket and return a bearer token.
 * Tokens are cached in memory and automatically refreshed when expired.
 */
const getShiprocketToken = async () => {
  // Return cached token if still valid (leaving 5 min buffer before expiry)
  if (cachedToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  // Prevent spamming Shiprocket login endpoint if authentication recently failed (prevents resetting Shiprocket's temporary security lockout)
  if (lastAuthError && Date.now() - authErrorTimestamp < AUTH_COOLOFF_MS) {
    const elapsedSec = Math.ceil((AUTH_COOLOFF_MS - (Date.now() - authErrorTimestamp)) / 1000);
    throw new Error(
      `Shiprocket authentication cool-off in progress (${elapsedSec}s remaining). Previous error: "${lastAuthError}". Update credentials in Admin Settings to try immediately.`
    );
  }

  const { email, password } = await getShiprocketConfig();

  if (!email || !password) {
    throw new Error(
      'Shiprocket credentials are missing. Please enter your Shiprocket Email & Password in Admin Settings (Shipping & COD) or set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in your backend .env file.'
    );
  }

  try {
    const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
      email,
      password
    });

    const { token } = response.data;

    if (!token) {
      throw new Error('Shiprocket authentication failed: No token received from server.');
    }

    cachedToken = token;
    tokenExpiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    lastAuthError = null;
    authErrorTimestamp = 0;

    console.log('[Shiprocket] ✅ Token refreshed successfully.');
    return token;
  } catch (error) {
    cachedToken = null;
    tokenExpiresAt = null;
    const msg = error.response?.data?.message || error.message;
    lastAuthError = msg;
    authErrorTimestamp = Date.now();

    console.error('[Shiprocket] ❌ Token generation failed:', msg);
    
    if (msg.includes('blocked') || msg.includes('login attempts')) {
      throw new Error(
        `Shiprocket authentication error: User blocked due to too many failed login attempts. ` +
        `Shiprocket has temporarily locked API login for account "${email}". Please wait 15–30 minutes without sending requests, ` +
        `or log in directly to app.shiprocket.in to unlock/reset your API password.`
      );
    }
    
    throw new Error(`Shiprocket authentication error: ${msg}`);
  }
};

/**
 * Returns a pre-configured Axios instance with the Shiprocket bearer token.
 */
const getShiprocketClient = async () => {
  const token = await getShiprocketToken();
  const instance = axios.create({
    baseURL: SHIPROCKET_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    timeout: 30000
  });

  instance.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.warn('[Shiprocket] ⚠️ Received 401/403 response. Clearing token cache.');
        clearShiprocketTokenCache();
      }
      return Promise.reject(error);
    }
  );

  return instance;
};

// ─── Order Management ─────────────────────────────────────────────────────────

/**
 * Create a new order on Shiprocket from a local Order document.
 * @param {Object} order - Populated Order mongoose document
 * @param {Array}  items - Array of populated OrderItem documents
 * @returns {Object} Shiprocket API response data
 */
const createShiprocketOrder = async (order, items) => {
  const client = await getShiprocketClient();
  const config = await getShiprocketConfig();

  const shippingAddr =
    typeof order.shippingAddress === 'string'
      ? JSON.parse(order.shippingAddress)
      : order.shippingAddress;

  const billingAddr =
    typeof order.billingAddress === 'string'
      ? JSON.parse(order.billingAddress)
      : order.billingAddress || shippingAddr;

  // Map local order items to Shiprocket's expected format
  const orderItems = (items || []).map((item, idx) => ({
    name: item.productName || `Item #${idx + 1}`,
    sku: item.sku || (item.product?.sku) || `SKU-${item.id || item._id || idx + 1}`,
    units: item.quantity || 1,
    selling_price: parseFloat(item.price || 0).toFixed(2),
    discount: '0',
    tax: parseFloat(item.taxRate || 0).toFixed(2),
    hsn: ''
  }));

  const isCOD = order.paymentMethod === 'cod' ? 1 : 0;

  // Sanitize phone: strip country code prefix and non-digit chars, keep last 10 digits
  const sanitizePhone = (phone) => {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  };

  const billingPhone = sanitizePhone(billingAddr?.phone || shippingAddr?.phone || order.user?.phone);
  const shippingPhone = sanitizePhone(shippingAddr?.phone || order.user?.phone);

  const payload = {
    order_id: order.orderNumber,
    order_date: new Date(order.createdAt).toISOString().split('T')[0],
    pickup_location: config.pickupLocation || 'Primary',

    // Billing Details
    billing_customer_name: billingAddr?.name || shippingAddr?.name || order.user?.firstName || 'Customer',
    billing_last_name: order.user?.lastName || '',
    billing_address: billingAddr?.street || shippingAddr?.street || '',
    billing_address_2: billingAddr?.address2 || '',
    billing_city: billingAddr?.city || shippingAddr?.city || '',
    billing_pincode: billingAddr?.zip || shippingAddr?.zip || '',
    billing_state: billingAddr?.state || shippingAddr?.state || '',
    billing_country: billingAddr?.country || shippingAddr?.country || 'India',
    billing_email: order.user?.email || '',
    billing_phone: billingPhone,
    billing_alternate_phone: '',

    // Shipping Details (same as billing if not different)
    shipping_is_billing: false,
    shipping_customer_name: shippingAddr?.name || 'Customer',
    shipping_last_name: '',
    shipping_address: shippingAddr?.street || '',
    shipping_address_2: shippingAddr?.address2 || '',
    shipping_city: shippingAddr?.city || '',
    shipping_pincode: shippingAddr?.zip || '',
    shipping_country: shippingAddr?.country || 'India',
    shipping_state: shippingAddr?.state || '',
    shipping_email: order.user?.email || '',
    shipping_phone: shippingPhone,

    // Order Items
    order_items: orderItems,

    // Payment & Amounts
    payment_method: isCOD ? 'COD' : 'Prepaid',
    shipping_charges: parseFloat(order.shippingCost || 0).toFixed(2),
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: parseFloat(order.discountAmount || 0).toFixed(2),
    sub_total: parseFloat(order.subtotal || 0).toFixed(2),
    length: parseFloat(process.env.SHIPROCKET_DEFAULT_LENGTH || 15),
    breadth: parseFloat(process.env.SHIPROCKET_DEFAULT_BREADTH || 12),
    height: parseFloat(process.env.SHIPROCKET_DEFAULT_HEIGHT || 10),
    weight: parseFloat(process.env.SHIPROCKET_DEFAULT_WEIGHT || 0.5)
  };

  try {
    const response = await client.post('/orders/create/adhoc', payload);
    const data = response.data;

    // Shiprocket sometimes returns HTTP 200 with an error payload or without order_id
    // Treat these as failures so we don't silently save null IDs
    if (!data || !data.order_id) {
      const shiprocketMsg =
        data?.message ||
        (data?.errors ? JSON.stringify(data.errors) : null) ||
        'Shiprocket did not return an order_id. The order may already exist on Shiprocket with this order number, or a validation error occurred.';
      console.error(`[Shiprocket] ❌ No order_id returned for #${order.orderNumber}. Full response:`, JSON.stringify(data));
      throw new Error(`Shiprocket order creation failed: ${shiprocketMsg}`);
    }

    console.log(`[Shiprocket] ✅ Order created for #${order.orderNumber}: order_id=${data.order_id}, shipment_id=${data.shipment_id}`);
    return data;
  } catch (error) {
    // Re-throw errors we already formatted above
    if (error.message.startsWith('Shiprocket order creation failed:')) throw error;
    const msg = error.response?.data?.message || error.message;
    console.error(`[Shiprocket] ❌ Failed to create order for #${order.orderNumber}:`, msg);
    throw new Error(`Shiprocket order creation failed: ${msg}`);
  }
};

/**
 * Check courier serviceability and get shipping rates.
 * @param {string} deliveryPincode - Customer delivery pincode
 * @param {number} weight - Package weight in kg
 * @param {number} cod - 1 for COD, 0 for Prepaid
 * @returns {Object} Shiprocket serviceability response
 */
const checkServiceability = async (deliveryPincode, weight = 0.5, cod = 0) => {
  const client = await getShiprocketClient();
  const config = await getShiprocketConfig();
  const pickupPincode = config.pickupPincode || '380015';

  try {
    const response = await client.get('/courier/serviceability/', {
      params: {
        pickup_postcode: pickupPincode,
        delivery_postcode: deliveryPincode,
        weight,
        cod
      }
    });
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket serviceability check failed: ${msg}`);
  }
};

/**
 * Assign the best/recommended courier to a Shiprocket shipment
 * and generate an AWB (Air Waybill) tracking number.
 * @param {number} shipmentId - Shiprocket shipment_id from order creation
 * @param {number} courierId  - Shiprocket courier_company_id (optional, auto-selects if omitted)
 * @returns {Object} AWB assignment response
 */
const assignCourierAndGenerateAWB = async (shipmentId, courierId = null) => {
  const client = await getShiprocketClient();

  const payload = { shipment_id: shipmentId }; // NOTE: Shiprocket expects a single number, NOT an array
  if (courierId) {
    payload.courier_id = courierId;
  }

  try {
    const response = await client.post('/courier/assign/awb', payload);

    // Log the full raw response so we can see what Shiprocket actually returned
    console.log('[Shiprocket] AWB raw response:', JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    // Log the full error body too
    console.error('[Shiprocket] ❌ AWB assignment error body:', JSON.stringify(error.response?.data, null, 2));
    throw new Error(`Shiprocket AWB assignment failed: ${msg}`);
  }
};

/**
 * Schedule a pickup for a shipment.
 * @param {Array}  shipmentIds  - Array of Shiprocket shipment IDs
 * @param {string} pickupDate   - Date string in YYYY-MM-DD format
 * @returns {Object} Pickup schedule response
 */
const schedulePickup = async (shipmentIds, pickupDate) => {
  const client = await getShiprocketClient();

  try {
    const response = await client.post('/courier/generate/pickup', {
      shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds],
      pickup_date: pickupDate
    });
    console.log(`[Shiprocket] ✅ Pickup scheduled for shipments:`, shipmentIds);
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket pickup scheduling failed: ${msg}`);
  }
};

/**
 * Generate and fetch the shipping label PDF URL.
 * @param {Array|number} shipmentIds - Shiprocket shipment ID(s)
 * @returns {Object} Label URL response
 */
const generateShippingLabel = async (shipmentIds) => {
  const client = await getShiprocketClient();
  const ids = Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds];

  try {
    const response = await client.post('/courier/generate/label', {
      shipment_id: ids
    });
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket label generation failed: ${msg}`);
  }
};

/**
 * Track a shipment by its AWB number.
 * @param {string} awbCode - AWB tracking number
 * @returns {Object} Tracking data
 */
const trackShipmentByAWB = async (awbCode) => {
  const client = await getShiprocketClient();

  try {
    const response = await client.get(`/courier/track/awb/${awbCode}`);
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket tracking failed: ${msg}`);
  }
};

/**
 * Track a shipment by Shiprocket order ID.
 * @param {number} shiprocketOrderId
 * @returns {Object} Tracking data
 */
const trackShipmentByOrderId = async (shiprocketOrderId) => {
  const client = await getShiprocketClient();

  try {
    const response = await client.get(`/orders/show/${shiprocketOrderId}`);
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket order tracking failed: ${msg}`);
  }
};

/**
 * Cancel a Shiprocket order.
 * @param {Array|number} orderIds - Shiprocket order IDs to cancel
 * @returns {Object} Cancellation response
 */
const cancelShiprocketOrder = async (orderIds) => {
  const client = await getShiprocketClient();
  const ids = Array.isArray(orderIds) ? orderIds : [orderIds];

  try {
    const response = await client.post('/orders/cancel', {
      ids
    });
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket order cancellation failed: ${msg}`);
  }
};

/**
 * Get a list of all Shiprocket pickup addresses configured for the seller.
 * @returns {Object} List of pickup addresses
 */
const getPickupAddresses = async () => {
  const client = await getShiprocketClient();

  try {
    const response = await client.get('/settings/company/pickup');
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket pickup addresses fetch failed: ${msg}`);
  }
};

/**
 * Generate manifest for one or more shipments.
 * @param {Array|number} shipmentIds
 * @returns {Object} Manifest response
 */
const generateManifest = async (shipmentIds) => {
  const client = await getShiprocketClient();
  const ids = Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds];

  try {
    const response = await client.post('/manifests/generate', {
      shipment_id: ids
    });
    return response.data;
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    throw new Error(`Shiprocket manifest generation failed: ${msg}`);
  }
};

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  clearShiprocketTokenCache,
  getShiprocketConfig,
  getShiprocketToken,
  createShiprocketOrder,
  checkServiceability,
  assignCourierAndGenerateAWB,
  schedulePickup,
  generateShippingLabel,
  trackShipmentByAWB,
  trackShipmentByOrderId,
  cancelShiprocketOrder,
  getPickupAddresses,
  generateManifest
};
