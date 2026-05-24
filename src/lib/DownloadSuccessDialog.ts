export class DownloadSuccessDialog {
  private dialog_element: HTMLDivElement | null = null
  private readonly title = 'Export Successful'
  private readonly content_html = '<p>Your animation export is ready!</p>'

  constructor (private readonly options?: { onClose?: () => void }) {}

  public show (): void {
    this.remove()
    this.dialog_element = document.createElement('div')
    this.dialog_element.className = 'download-success-dialog-overlay'

    // HTML template for the content
    this.dialog_element.innerHTML = `
      <div class="download-success-dialog-content">
        <h2>${this.title}</h2>
        <div class="download-success-dialog-body">${this.content_html}</div>
        <button class="download-success-dialog-close">Close</button>
      </div>
    `
    document.body.appendChild(this.dialog_element)

    // Close button handler
    const close_button = this.dialog_element.querySelector('.download-success-dialog-close')
    close_button?.addEventListener('click', () => { this.remove() })

    // Close on overlay click
    this.dialog_element.addEventListener('click', (e) => {
      if (e.target === this.dialog_element) this.remove()
    })
  }

  private remove (): void {
    if (this.dialog_element && this.dialog_element.parentNode) {
      this.dialog_element.parentNode.removeChild(this.dialog_element)
      this.dialog_element = null
      if (this.options?.onClose) this.options.onClose()
    }
  }
}
