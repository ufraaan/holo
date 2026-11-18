// An empty title can make browsers show the URL instead. Use invisible text.
const BLANK_TITLE = "\u200b";
const TRANSPARENT_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
const ICON_SELECTOR = 'link[rel~="icon"], link[rel^="apple-touch-icon"]';
const MASKED_ATTRIBUTES = { href: TRANSPARENT_ICON, type: "image/png", sizes: "any" };

let activeTitle: { value: string } | undefined;

// Title owners such as unread-message alerts must save the real title while masked.
export function getTabTitle(): string {
  return activeTitle?.value ?? document.title;
}

export function setTabTitle(title: string) {
  if (activeTitle) activeTitle.value = title;
  else document.title = title;
}

/** Conceal tab identity, including metadata updates made while privacy is on. */
export function hideTabIdentity(): () => void {
  const titleState = { value: document.title };
  activeTitle = titleState;
  const savedIcons = new Map<HTMLLinkElement, Map<string, string | null>>();
  const privacyIcon = document.createElement("link");
  privacyIcon.rel = "icon";
  for (const [name, value] of Object.entries(MASKED_ATTRIBUTES)) {
    privacyIcon.setAttribute(name, value);
  }

  const observer = new MutationObserver(mask);
  function mask() {
    // Our own writes must not trigger an observer loop.
    observer.disconnect();
    if (document.title !== BLANK_TITLE) titleState.value = document.title;
    document.title = BLANK_TITLE;

    for (const icon of document.head.querySelectorAll<HTMLLinkElement>(ICON_SELECTOR)) {
      if (icon === privacyIcon) continue;
      let attributes = savedIcons.get(icon);
      if (!attributes) {
        attributes = new Map();
        savedIcons.set(icon, attributes);
      }
      for (const [name, value] of Object.entries(MASKED_ATTRIBUTES)) {
        const current = icon.getAttribute(name);
        if (!attributes.has(name) || current !== value) attributes.set(name, current);
        icon.setAttribute(name, value);
      }
    }
    if (!privacyIcon.isConnected) document.head.append(privacyIcon);
    observer.observe(document.head, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["href", "rel", "type", "sizes"],
    });
  }
  mask();

  return () => {
    // Capture pending app updates before restoring the latest normal metadata.
    mask();
    observer.disconnect();
    activeTitle = undefined;
    document.title = titleState.value;
    for (const [icon, attributes] of savedIcons) {
      for (const [name, value] of attributes) {
        if (value === null) icon.removeAttribute(name);
        else icon.setAttribute(name, value);
      }
    }
    privacyIcon.remove();
  };
}
