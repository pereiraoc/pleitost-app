// Stub do image-slot do Claude Design (não puxado — ver image-slot.js.note.md).
// Só garante caixa visível com as dimensões/máscara do template.
if (!customElements.get('image-slot')) {
  customElements.define(
    'image-slot',
    class extends HTMLElement {
      connectedCallback() {
        if (!this.style.display) this.style.display = 'block'
        if (!this.style.background) this.style.background = 'rgba(127,127,127,.18)'
        const mask = this.getAttribute('mask')
        if (mask && !this.style.clipPath) this.style.clipPath = mask
      }
    },
  )
}
