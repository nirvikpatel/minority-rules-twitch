export const CONFETTI_PARTICLES = 72;

/** Static markup uses external CSS so it also works under Twitch's CSP. */
export function confettiMarkup(count = CONFETTI_PARTICLES) {
  return `<div class="confetti" aria-hidden="true">${'<i></i>'.repeat(count)}</div>`;
}
