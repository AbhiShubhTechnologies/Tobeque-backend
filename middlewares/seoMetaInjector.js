const path = require('path');
const fs = require('fs');

/**
 * Express middleware to dynamically inject route-specific <title> and <meta> tags
 * into index.html before returning the raw HTML response to the browser / crawler.
 */
function createSeoMetaInjector(distPath) {
  return function seoMetaInjector(req, res, next) {
    // Only intercept HTML GET requests
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();

    const indexPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexPath)) return next();

    let baseHtml = fs.readFileSync(indexPath, 'utf-8');

    const domain = 'https://tobeque.com';
    const reqPath = req.path.replace(/^\/+|\/+$/g, '');

    const routesMeta = {
      'about-tobeque': {
        title: 'About Tobeque | Teen Fashion Brand for Girls in India',
        description: 'Learn about Tobeque, an Indian fashion brand creating stylish, comfortable clothing for teen girls with in-house design and manufacturing in Haryana, India.',
        keywords: 'about Tobeque, teen fashion brand India, fashion brand for teen girls, teenage girls clothing brand, girls fashion India, teen clothing brand, Tobeque Haryana'
      },
      'about-us': {
        title: 'About Tobeque | Teen Fashion Brand for Girls in India',
        description: 'Learn about Tobeque, an Indian fashion brand creating stylish, comfortable clothing for teen girls with in-house design and manufacturing in Haryana, India.',
        keywords: 'about Tobeque, teen fashion brand India, fashion brand for teen girls, teenage girls clothing brand, girls fashion India, teen clothing brand, Tobeque Haryana',
        canonical: 'https://tobeque.com/about-tobeque'
      },
      'about': {
        title: 'About Tobeque | Teen Fashion Brand for Girls in India',
        description: 'Learn about Tobeque, an Indian fashion brand creating stylish, comfortable clothing for teen girls with in-house design and manufacturing in Haryana, India.',
        keywords: 'about Tobeque, teen fashion brand India, fashion brand for teen girls, teenage girls clothing brand, girls fashion India, teen clothing brand, Tobeque Haryana',
        canonical: 'https://tobeque.com/about-tobeque'
      },
      'contact': {
        title: 'Contact Tobeque | Teen Girls Fashion Support India',
        description: 'Contact Tobeque for help with orders, products, returns, sizing or general questions. Reach our teen girls fashion support team in Haryana, India today.',
        keywords: 'contact Tobeque, Tobeque customer support, Tobeque contact details, teen fashion support India, clothing customer service, Tobeque Haryana, order support Tobeque'
      },
      'privacy-policy': {
        title: 'Privacy Policy | Tobeque Teen Fashion',
        description: "Read Tobeque's Privacy Policy to learn how we protect your personal information, data security, and privacy rights when shopping for teen fashion.",
        keywords: 'privacy policy, Tobeque privacy, data protection, security'
      },
      'terms-and-conditions': {
        title: 'Terms & Conditions | Tobeque Teen Fashion',
        description: 'Review the Terms & Conditions for shopping at Tobeque online store, including ordering, payment, shipping, and usage terms.',
        keywords: 'terms and conditions, Tobeque terms, store policies'
      },
      'cookie-policy': {
        title: 'Cookie Policy | Tobeque Teen Fashion',
        description: 'Learn about how Tobeque uses cookies and similar technologies to enhance your shopping experience and website security.',
        keywords: 'cookie policy, Tobeque cookies, tracking policies'
      },
      'cookie-settings': {
        title: 'Cookie Settings | Tobeque Teen Fashion',
        description: 'Manage your cookie settings and privacy preferences at Tobeque.',
        keywords: 'cookie settings, privacy preferences, Tobeque cookies'
      },
      'career': {
        title: 'Careers at Tobeque | Join Our Fashion Team',
        description: 'Explore job opportunities and careers at Tobeque. Join our passionate team of designers, marketers, and fashion enthusiasts.',
        keywords: 'careers at Tobeque, fashion jobs India, Tobeque hiring'
      },
      'faq': {
        title: 'Frequently Asked Questions (FAQ) | Tobeque',
        description: 'Find quick answers to common questions about orders, shipping, returns, sizing, payment methods, and account settings at Tobeque.',
        keywords: 'Tobeque FAQ, order help, shipping questions, sizing guide'
      },
      'refund-request': {
        title: 'Submit Refund Request | Tobeque',
        description: 'Submit a return or refund request for your Tobeque order. Fast, hassle-free 7-day return policy.',
        keywords: 'Tobeque return, refund request, 7 day return'
      },
      'blogs': {
        title: 'Tobeque Style Journal | Teen Fashion Tips & Trends',
        description: 'Discover the latest teen fashion tips, outfit ideas, styling guides, and trend updates on the Tobeque Style Journal.',
        keywords: 'teen fashion blog, outfit ideas, styling tips, Tobeque journal'
      },
      'style-journal': {
        title: 'Tobeque Style Journal | Teen Fashion Tips & Trends',
        description: 'Discover the latest teen fashion tips, outfit ideas, styling guides, and trend updates on the Tobeque Style Journal.',
        keywords: 'teen fashion blog, outfit ideas, styling tips, Tobeque journal',
        canonical: 'https://tobeque.com/blogs'
      },
      'steal-the-style': {
        title: 'Steal The Style | Curated Teen Outfits | Tobeque',
        description: 'Get inspired by curated outfits and complete looks designed for teenagers at Tobeque.',
        keywords: 'steal the style, outfit inspiration, teen outfits, curated looks'
      }
    };

    const targetMeta = routesMeta[reqPath];
    if (!targetMeta) return next();

    const title = targetMeta.title;
    const description = targetMeta.description;
    const keywords = targetMeta.keywords;
    const canonicalUrl = `${domain}/${reqPath}`;

    let updatedHtml = baseHtml;
    updatedHtml = updatedHtml.replace(/<title>.*?<\/title>/gi, `<title>${title}</title>`);
    updatedHtml = updatedHtml.replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/gi, `<meta name="description" content="${description}" />`);
    if (updatedHtml.includes('name="keywords"')) {
      updatedHtml = updatedHtml.replace(/<meta\s+name="keywords"\s+content=".*?"\s*\/?>/gi, `<meta name="keywords" content="${keywords}" />`);
    } else {
      updatedHtml = updatedHtml.replace('</head>', `  <meta name="keywords" content="${keywords}" />\n</head>`);
    }
    updatedHtml = updatedHtml.replace(/<link\s+rel="canonical"\s+href=".*?"\s*\/?>/gi, `<link rel="canonical" href="${canonicalUrl}" />`);
    updatedHtml = updatedHtml.replace(/<meta\s+property="og:title"\s+content=".*?"\s*\/?>/gi, `<meta property="og:title" content="${title}" />`);
    updatedHtml = updatedHtml.replace(/<meta\s+property="og:description"\s+content=".*?"\s*\/?>/gi, `<meta property="og:description" content="${description}" />`);
    updatedHtml = updatedHtml.replace(/<meta\s+property="og:url"\s+content=".*?"\s*\/?>/gi, `<meta property="og:url" content="${canonicalUrl}" />`);
    updatedHtml = updatedHtml.replace(/<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/gi, `<meta name="twitter:title" content="${title}" />`);
    updatedHtml = updatedHtml.replace(/<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/gi, `<meta name="twitter:description" content="${description}" />`);

    return res.send(updatedHtml);
  };
}

module.exports = createSeoMetaInjector;
