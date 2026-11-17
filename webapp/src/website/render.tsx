import { renderToStaticMarkup } from 'react-dom/server';
import Website from './Website.tsx';

/** Render the website body to static HTML. Called at build time and by the dev server. */
export function render(): string {
  return renderToStaticMarkup(<Website />);
}
