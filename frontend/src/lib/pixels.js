// Meta (Facebook) Pixel + TikTok Pixel loaders.
// Pixel IDs are public identifiers (embedded in page HTML), safe to expose to all users.

let metaLoaded = false;
let tiktokLoaded = false;

export function initMetaPixel(pixelId) {
  if (!pixelId || metaLoaded || window.fbq) return;
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');
  metaLoaded = true;
}

export function initTiktokPixel(pixelId) {
  if (!pixelId || tiktokLoaded || window.ttq) return;
  /* eslint-disable */
  !function (w, d, t) {
    w.TiktokAnalyticsObject = t;
    var ttq = w[t] = w[t] || [];
    ttq.methods = ["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
    ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e };
    ttq.load = function (e, n) {
      var i = "https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = i; ttq._t = ttq._t || {}; ttq._t[e] = +new Date;
      ttq._o = ttq._o || {}; ttq._o[e] = n || {};
      var o = d.createElement("script"); o.type = "text/javascript"; o.async = !0; o.src = i + "?sdkid=" + e + "&lib=" + t;
      var a = d.getElementsByTagName("script")[0]; a.parentNode.insertBefore(o, a);
    };
    ttq.load(pixelId);
    ttq.page();
  }(window, document, 'ttq');
  /* eslint-enable */
  tiktokLoaded = true;
}

export function trackPageView() {
  try { if (window.fbq) window.fbq('track', 'PageView'); } catch {}
  try { if (window.ttq) window.ttq.page(); } catch {}
}

export function trackEvent(name, data = {}) {
  try { if (window.fbq) window.fbq('track', name, data); } catch {}
  try { if (window.ttq) window.ttq.track(name, data); } catch {}
}