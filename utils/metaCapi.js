/**
 * Meta Conversions API (CAPI) Service
 *
 * - Sends server-side events to Meta Graph API v22.0
 * - Normalises and SHA-256 hashes PII (email, phone, external_id) per Meta requirements
 * - Implements event deduplication with browser-side Pixel via identical event_name + event_id
 * - Non-blocking async fire-and-forget with safe logging
 * - Never breaks checkout or payment flow if Meta API is unreachable
 */

const crypto = require('crypto');
const https = require('https');

const PIXEL_ID = process.env.META_PIXEL_ID || '1830883024577100';
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const API_VERSION = process.env.META_API_VERSION || 'v22.0';
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || null;

// ─── Hashing helpers ─────────────────────────────────────────────────────────

function hashEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function hashPhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  let normalized = digits;
  if (digits.length === 10) {
    normalized = '91' + digits;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    normalized = digits;
  }
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function hashExternalId(id) {
  if (!id) return null;
  const normalized = String(id).trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// ─── CAPI Event Sender ────────────────────────────────────────────────────────

/**
 * Send a single event to Meta Conversions API
 */
async function sendCapiEvent(eventData) {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn('[MetaCAPI] META_PIXEL_ID or META_ACCESS_TOKEN not configured. Event skipped:', eventData.event_name);
    return;
  }

  const {
    event_name,
    event_time = Math.floor(Date.now() / 1000),
    event_id,
    event_source_url = 'https://tobeque.com',
    user_data = {},
    custom_data = {},
    action_source = 'website',
  } = eventData;

  const hashedUserData = {};

  if (user_data.email) {
    const h = hashEmail(user_data.email);
    if (h) hashedUserData.em = [h];
  }
  if (user_data.phone) {
    const h = hashPhone(user_data.phone);
    if (h) hashedUserData.ph = [h];
  } else {
    hashedUserData.ph = [null];
  }
  if (user_data.external_id) {
    const h = hashExternalId(user_data.external_id);
    if (h) hashedUserData.external_id = [h];
  }
  if (user_data.client_ip_address) hashedUserData.client_ip_address = user_data.client_ip_address;
  if (user_data.client_user_agent) hashedUserData.client_user_agent = user_data.client_user_agent;
  if (user_data.fbp) hashedUserData.fbp = user_data.fbp;
  if (user_data.fbc) hashedUserData.fbc = user_data.fbc;

  const eventPayload = {
    event_name,
    event_time,
    action_source,
    event_source_url,
    user_data: hashedUserData,
    custom_data,
    original_event_data: {
      event_name,
      event_time
    }
  };

  if (event_id) {
    eventPayload.event_id = event_id;
  }

  const payload = {
    data: [eventPayload]
  };

  if (TEST_EVENT_CODE) {
    payload.test_event_code = TEST_EVENT_CODE;
  }

  const bodyStr = JSON.stringify(payload);
  const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;

  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[MetaCAPI] Event '${event_name}' sent successfully. EventID: ${event_id || 'none'}`);
        } else {
          console.error(`[MetaCAPI] Event '${event_name}' failed. Status: ${res.statusCode}. Response (truncated): ${data.slice(0, 300)}`);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.error(`[MetaCAPI] Network error sending '${event_name}':`, err.message);
      resolve();
    });

    req.write(bodyStr);
    req.end();
  });
}

function sendCapiEventAsync(eventData) {
  sendCapiEvent(eventData).catch((err) => {
    console.error('[MetaCAPI] Unexpected error:', err?.message || err);
  });
}

/**
 * Send Purchase event via CAPI
 */
function sendPurchaseEvent({ order, user, items, eventId, requestMeta = {} }) {
  const totalAmount = typeof order.totalAmount === 'number' ? order.totalAmount : parseFloat(order.totalAmount) || 0;
  const contentIds = (items || []).map(item => String(item.product || item.productId || ''));
  const numItems = (items || []).reduce((n, item) => n + (item.quantity || 1), 0);

  sendCapiEventAsync({
    event_name: 'Purchase',
    event_time: Math.floor((order.createdAt ? new Date(order.createdAt).getTime() : Date.now()) / 1000),
    event_id: eventId,
    event_source_url: 'https://tobeque.com/checkout',
    action_source: 'website',
    user_data: {
      email: user?.email || null,
      phone: user?.phone || null,
      external_id: user?.id || user?._id ? String(user.id || user._id) : null,
      client_ip_address: requestMeta.ip || null,
      client_user_agent: requestMeta.userAgent || null,
      fbp: requestMeta.fbp || null,
      fbc: requestMeta.fbc || null,
    },
    custom_data: {
      currency: 'INR',
      value: totalAmount.toFixed(2),
      content_ids: contentIds,
      content_type: 'product',
      num_items: numItems,
      order_id: order.orderNumber || String(order.id || order._id),
    },
  });
}

module.exports = {
  sendCapiEvent,
  sendCapiEventAsync,
  sendPurchaseEvent,
};
