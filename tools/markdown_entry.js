// Shared browser renderer; raw HTML stays escaped. Interactive blocks are sandboxed by app.js.
import MarkdownIt from 'markdown-it';
const engine = new MarkdownIt({html: false, linkify: false, typographer: false});
engine.inline.ruler.before('link', 'lumen_concept', (state, silent) => {
  if (state.linkLevel || state.src.slice(state.pos, state.pos + 2) !== '[[') return false;
  const end = state.src.indexOf(']]', state.pos + 2);
  if (end < 0) return false;
  const parts = state.src.slice(state.pos + 2, end).split('|'), name = parts[0].trim();
  if (!name || name.includes('\n')) return false;
  if (!silent) {
    const open = state.push('link_open', 'a', 1); open.attrs = [['href', '#/concept/' + encodeURIComponent(name)]];
    const text = state.push('text', '', 0); text.content = parts.slice(1).join('|').trim() || name;
    state.push('link_close', 'a', -1);
  }
  state.pos = end + 2; return true;
});
engine.inline.ruler.before('escape', 'lumen_math_delimiters', (state, silent) => {
  const opener = state.src.slice(state.pos, state.pos + 2), closer = {'\\(':'\\)', '\\[':'\\]'}[opener];
  if (!closer) return false;
  const end = state.src.indexOf(closer, state.pos + 2); if (end < 0) return false;
  if (!silent) state.push('text', '', 0).content = state.src.slice(state.pos, end + 2);
  state.pos = end + 2; return true;
});
const linkOpen = engine.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
engine.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx], href = token.attrGet('href') || '';
  if (/^https?:\/\//i.test(href)) {token.attrSet('target', '_blank');token.attrSet('rel', 'noopener noreferrer');}
  return linkOpen(tokens, idx, options, env, self);
};
window.LumenMarkdown = Object.freeze({render: source => engine.render(String(source || ''))});
