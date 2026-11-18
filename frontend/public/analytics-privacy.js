window.holoBeforeSend = function (type, payload) {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl || type !== 'event' || payload.name) return false;
  var path = new URL(payload.url || '/', location.origin).pathname;
  var page = ['/', '/privacy', '/terms'].includes(path) ? path : path.startsWith('/room/') ? '/room/[roomId]' : '/other';
  return { website: payload.website, hostname: location.hostname, url: page, title: 'Holo', language: payload.language, screen: payload.screen, referrer: '' };
};
