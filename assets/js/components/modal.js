(function(){
    const $ = window.jQuery;
    const generateTemplate = (data) => {
        const {title, body, id, size, footer, show} = data || {};
        return `<div class="create-attribute-dialog modal in sfmcfix-custommodal" id="${sfmcfix.escapeHtml(id || 'sfmcfix-modal-' + new Date().getDate())}" tabindex="-1" role="dialog" aria-hidden="true" data-backdrop="static">
            <div class="modal-dialog ${sfmcfix.escapeHtml(size || 'modal-lg')}">
                <div class="modal-content">
                    <div class="modal-header"><button type="button" class="close" data-customdismiss><span aria-hidden="true">×</span><span class="sr-only">Close</span></button>
                        ${title && `<h4 class="modal-title">${sfmcfix.escapeHtml(title)}</h4>` || ''}
                    </div>
                    ${body && `<div class="modal-body">${body}</div>` || ''}
                    ${footer && `<div class="modal-footer">${footer}</div>` || ''}
                </div>
            </div>
        </div>`
    }

    const defaultData = {}

    window.sfmcfix = window.sfmcfix || {};

    window.sfmcfix.customModal = function(data, options) {
        this.generated = false;
        this.data = data || {
            footer : `<button class="btn btn-default" data-customdismiss>Close</button>`
        };
        this.options = options || {};
        return this;
    }

    window.sfmcfix.customModal.prototype.htmlBodyLoad = function(filename, callback) {
        sfmcfix.addHtml(`modals/${filename}`, false, (html) => {
            this.generate({body: html});
            callback && callback(this.$modal, this);
        });
    }

    window.sfmcfix.customModal.prototype.hanlders = function () {
        this.$modal.on('click', '[data-customdismiss]', () => {
            this.hide();
        });
    }

    window.sfmcfix.customModal.prototype.generate = function(data) {
        var modalHTML = generateTemplate({...this.data,...(data || {})});
        if(modalHTML) {
            this.generated = true;
            this.$modal = $(modalHTML);

            return this.$modal;
        }
    }

    window.sfmcfix.customModal.prototype.place = function(parent) {
        parent = $(parent || 'body');
        parent.append(this.$modal);
        setTimeout(() => {
            this.hanlders();
            this.$modal.find('script[data-filename]').each(function() {
                const filename = $(this).data('filename');
                filename && sfmcfix.addJs(filename);
            });
            if(this.data.show) this.show();
        },500)
    }

    window.sfmcfix.customModal.prototype.show = function() {
        this.$modal && this.$modal.modal('show');
    }

    window.sfmcfix.customModal.prototype.hide = function() {
        this.$modal && this.$modal.modal('hide');
    }
})()
