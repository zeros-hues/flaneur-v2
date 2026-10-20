import { serialise } from '../lib/serialise';
import { isOverlayOpen, openCaptureOverlay } from '../lib/ui/overlay';
import { webPage } from '../lib/capture-v2';
import { captureIdentity, deliver, extensionVersion } from './deliver';
import type { CapturePayload } from '../lib/messages';

// Injected only by an explicit toolbar gesture (activeTab), never on all visited pages.
if (webPage(location.href) && !isOverlayOpen() && !document.querySelector('flaneur-ui')?.shadowRoot?.querySelector('form')) {
  const sourceUrl = location.href;
  const articles = document.querySelectorAll('article');
  const root = articles.length === 1 ? articles[0]! : document.querySelector('main') ?? document.body;
  const wrapper = document.createElement('article');
  wrapper.setAttribute('data-flaneur-source', 'web');
  const title = document.createElement('h1'); title.textContent = document.title; wrapper.append(title);
  const clone = root.cloneNode(true) as Element;
  // Never retain editable form values or password fields in generic page captures.
  clone.querySelectorAll('input,textarea,select,[contenteditable],form').forEach(element => element.remove());
  wrapper.append(clone);
  const html = serialise(wrapper);
  let pending: CapturePayload | null = null;
  openCaptureOverlay({ subject: { name: document.title || 'This page', headline: new URL(sourceUrl).hostname },
    context: 'Saves the page content loaded here.', onCancel() {},
    async onSubmit(note) {
      if (pending) return deliver(pending);
      if (location.href !== sourceUrl) throw new Error('The page changed. Open Save on the current page.');
      pending = { ...captureIdentity(), type: 'article', sourceUrl, html, note, urn: null, extensionVersion: extensionVersion() };
      return deliver(pending);
    },
  });
}
