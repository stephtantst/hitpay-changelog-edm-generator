export const DOCS_BASE = 'https://docs.hitpayapp.com';

/**
 * Each entry lists keywords (checked against title first, then description)
 * and the docs path relative to DOCS_BASE.
 * More specific entries should come before broader ones.
 */
const DOCS_MAP: Array<{ keywords: string[]; path: string }> = [
  // ── Connections ──────────────────────────────────────────────────────────
  { keywords: ['bukku'],                                            path: 'connections/bukku' },
  { keywords: ['quickbooks', 'quick books'],                        path: 'connections/quickbooks' },
  { keywords: ['zoho books', 'zoho'],                               path: 'connections/zoho-books' },
  { keywords: ['zapier'],                                            path: 'connections/zapier' },
  { keywords: ['make.com', 'make integration'],                     path: 'connections/make' },
  { keywords: ['twilio'],                                            path: 'connections/twilio' },
  { keywords: ['eber'],                                              path: 'connections/eber' },
  { keywords: ['cal.com', 'cal scheduling'],                        path: 'connections/cal' },
  { keywords: ['xero'],                                              path: 'connections/xero' },
  { keywords: ['stripe connect', 'stripe'],                         path: 'connections/stripe/overview' },

  // ── Plugins ──────────────────────────────────────────────────────────────
  { keywords: ['shopify'],                                           path: 'plugins/shopify' },
  { keywords: ['woocommerce', 'woo commerce'],                      path: 'plugins/woocommerce' },
  { keywords: ['wordpress'],                                         path: 'plugins/wordpress' },
  { keywords: ['wix'],                                               path: 'plugins/wix' },
  { keywords: ['shoplazza'],                                         path: 'plugins/shoplazza' },
  { keywords: ['opencart'],                                          path: 'plugins/opencart' },
  { keywords: ['prestashop'],                                        path: 'plugins/prestashop' },
  { keywords: ['magento'],                                           path: 'plugins/magento' },
  { keywords: ['odoo'],                                              path: 'plugins/odoo' },
  { keywords: ['ecwid'],                                             path: 'plugins/ecwid' },
  { keywords: ['easystore'],                                         path: 'plugins/easystore' },
  { keywords: ['shopcada'],                                          path: 'plugins/shopcada' },

  // ── Payment Methods ───────────────────────────────────────────────────────
  { keywords: ['shopback pay pos', 'shopback pos'],                 path: 'payment-methods/shopback' },
  { keywords: ['shopback pay', 'shopback'],                         path: 'payment-methods/shopback' },
  { keywords: ['shopeepay', 'shopee pay'],                          path: 'payment-methods/shopeepay' },
  { keywords: ['spaylater', 'spay later', 's pay later'],           path: 'payment-methods/spaylater' },
  { keywords: ['grabpay paylater', 'grab pay later'],               path: 'payment-methods/grabpay_paylater' },
  { keywords: ['grabpay', 'grab pay'],                              path: 'payment-methods/grabpay' },
  { keywords: ['duitnow qr', 'duitnow'],                           path: 'payment-methods/duitnow' },
  { keywords: ['paynow'],                                            path: 'payment-methods/paynow' },
  { keywords: ['fpx'],                                               path: 'payment-methods/fpx' },
  { keywords: ['touch n go', "touch'n'go", 'touchngo', 'tng ewallet'], path: 'payment-methods/touchngo' },
  { keywords: ['promptpay'],                                         path: 'payment-methods/promptpay' },
  { keywords: ['qris'],                                              path: 'payment-methods/qris' },
  { keywords: ['alipay+', 'alipay plus', 'alipay'],                path: 'payment-methods/alipay' },
  { keywords: ['atome'],                                             path: 'payment-methods/atome' },
  { keywords: ['gcash'],                                             path: 'payment-methods/gcash' },
  { keywords: ['payid'],                                             path: 'payment-methods/payid' },
  { keywords: ['wechat pay', 'wechatpay'],                         path: 'payment-methods/wechatpay' },
  { keywords: ['upi'],                                               path: 'payment-methods/upi' },
  { keywords: ['qrph'],                                              path: 'payment-methods/qrph' },
  { keywords: ['truemoney', 'true money'],                          path: 'payment-methods/truemoney' },
  { keywords: ['boost wallet', 'boost'],                            path: 'payment-methods/boost' },
  { keywords: ['maybankqr', 'maybank qr'],                         path: 'payment-methods/maybankqr' },
  { keywords: ['vietqr', 'viet qr'],                               path: 'payment-methods/vietqr' },
  { keywords: ['billease'],                                          path: 'payment-methods/billease' },
  { keywords: ['alfamart'],                                          path: 'payment-methods/alfamart' },
  { keywords: ['rabbitlinepay', 'rabbit line pay'],                 path: 'payment-methods/rabbitlinepay' },
  { keywords: ['virtual account'],                                   path: 'payment-methods/virtualaccount' },

  // ── POS / In-Person ───────────────────────────────────────────────────────
  { keywords: ['tap to pay on iphone', 'tap-to-pay iphone', 'tap to pay iphone'], path: 'pos/readers/tap-to-pay-iphone' },
  { keywords: ['tap to pay', 'tap-to-pay'],                        path: 'pos/readers/tap-to-pay' },
  { keywords: ['wisepad3', 'wisepad 3', 'wisepad'],                path: 'pos/readers/wisepad3' },
  { keywords: ['wisepose'],                                          path: 'pos/readers/wisepose' },
  { keywords: ['flexipos'],                                          path: 'pos/readers/flexipos' },
  { keywords: ['all-in-one s1f2', 's1f2'],                         path: 'pos/readers/all-in-one-s1f2' },
  { keywords: ['all-in-one dx4000', 'dx4000'],                     path: 'pos/readers/all-in-one-dx4000' },
  { keywords: ['pos max'],                                           path: 'pos/readers/pos-max-v3mix' },
  { keywords: ['sunmi v2s', 'sunmi v3', 'sunmi'],                  path: 'pos/readers/sunmi-v2s-v3' },
  { keywords: ['soundbox'],                                          path: 'pos/readers/soundbox' },
  { keywords: ['receipt printer', 'bluetooth printer'],             path: 'pos/receipt-printer' },
  { keywords: ['cash drawer'],                                       path: 'pos/cash-drawer' },
  { keywords: ['barcode scanner'],                                   path: 'pos/barcode-scanner' },
  { keywords: ['customer display'],                                  path: 'pos/customer-display' },
  { keywords: ['mall gto'],                                          path: 'pos/mall-gto' },
  { keywords: ['point of sale', 'pos kiosk', 'quick sale'],        path: 'pos/overview' },

  // ── Static QR ─────────────────────────────────────────────────────────────
  { keywords: ['static qr code', 'static qr'],                     path: 'static-qrs/static-qr' },

  // ── Payment Links ─────────────────────────────────────────────────────────
  { keywords: ['payment link'],                                      path: 'payment-links/payment-links' },

  // ── Billing ───────────────────────────────────────────────────────────────
  { keywords: ['subscription plan', 'recurring billing', 'recurring plan'], path: 'billing/subscriptions' },

  // ── Invoicing ─────────────────────────────────────────────────────────────
  { keywords: ['repeating invoice'],                                 path: 'invoicing/repeating-invoice' },
  { keywords: ['invoice'],                                           path: 'invoicing/invoice-basics' },

  // ── Online Store ──────────────────────────────────────────────────────────
  { keywords: ['custom domain'],                                     path: 'store/custom-domain' },
  { keywords: ['seo settings', 'store seo'],                       path: 'store/seo-settings' },
  { keywords: ['online store', 'e-commerce store'],                 path: 'store/setup-online-store' },

  // ── Bank Payouts ──────────────────────────────────────────────────────────
  { keywords: ['bank payout', 'bank transfer payout'],              path: 'bank-payouts/bank-payouts' },

  // ── B2B ───────────────────────────────────────────────────────────────────
  { keywords: ['b2b payment', 'business to business', 'b2b collection'], path: 'b2b-payments/overview' },

  // ── Payments ──────────────────────────────────────────────────────────────
  { keywords: ['cross-border payment', 'cross border payment'],     path: 'payments/cross-border-payments' },
  { keywords: ['checkout customis', 'checkout customiz'],           path: 'payments/checkout-customisation' },
  { keywords: ['admin fee'],                                         path: 'payments/admin-fees' },
  { keywords: ['refund'],                                            path: 'payments/refund' },

  // ── API / Developer ───────────────────────────────────────────────────────
  { keywords: ['webhook'],                                           path: 'apis/guide/overview' },
  { keywords: ['embedded qr', 'embedded payment'],                  path: 'apis/guide/embedded-qr-code-payments/domestic-qr' },
  { keywords: ['platform api'],                                      path: 'apis/guide/platform-apis' },
  { keywords: ['sandbox', 'test mode'],                             path: 'apis/guide/sandbox' },
  { keywords: ['payment method api', 'payment methods reference'], path: 'apis/guide/payment-methods-reference' },
  { keywords: ['api key', 'rest api', 'developer api'],             path: 'apis/overview' },

  // ── Reporting ─────────────────────────────────────────────────────────────
  { keywords: ['order analytics', 'order report'],                  path: 'reporting/order-analytics' },
  { keywords: ['analytics', 'reporting', 'transaction report'],    path: 'reporting/payments' },

  // ── Security ──────────────────────────────────────────────────────────────
  { keywords: ['audit log'],                                         path: 'security/audit-logs' },
  { keywords: ['two-factor', '2fa', 'two factor'],                 path: 'setup/2fa' },
  { keywords: ['fraud'],                                             path: 'security' },

  // ── Setup / Account ───────────────────────────────────────────────────────
  { keywords: ['user management', 'user role', 'staff permission'], path: 'setup/user-management' },
  { keywords: ['business verification', 'kyc'],                     path: 'setup/business-verification' },
  { keywords: ['notifications'],                                     path: 'settings/notifications' },
];

export function matchDocsUrl(title: string, description: string): string | null {
  const titleLow = title.toLowerCase();
  const fullLow = (title + ' ' + description).toLowerCase();

  // Title match first (higher confidence)
  for (const entry of DOCS_MAP) {
    if (entry.keywords.some(k => titleLow.includes(k.toLowerCase()))) {
      return `${DOCS_BASE}/${entry.path}`;
    }
  }
  // Fall back to description match
  for (const entry of DOCS_MAP) {
    if (entry.keywords.some(k => fullLow.includes(k.toLowerCase()))) {
      return `${DOCS_BASE}/${entry.path}`;
    }
  }
  return null;
}
