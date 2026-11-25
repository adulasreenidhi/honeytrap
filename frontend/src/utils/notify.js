export function notify(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('honeygate:toast', {
    detail: { message, type },
  }))
}
