document.addEventListener('DOMContentLoaded', () => {
    const fallbacks = {
        department: 'Department of Computer Science and Engineering',
        document_type: 'LAB REPORT / ASSIGNMENT / FORUM',
        course_title: 'Your Course Title',
        course_code: 'Your Course Code',
        submitted_to_name: 'Teacher Name',
        submitted_to_designation: 'Designation',
        submitted_to_department: 'Department of Computer Science and Engineering',
        submitted_by_name: 'Your Name',
        submitted_by_id: 'Your ID',
        submitted_by_batch: 'Your Batch',
        submitted_by_department: 'Computer Science and Engineering'
    };

    const form = document.getElementById('cover-page-form');
    const resetButton = document.getElementById('reset-cover-page');
    const downloadButton = document.getElementById('download-cover-page');
    const statusElement = document.getElementById('cover-page-status');
    const coverPaper = document.getElementById('cover-paper');

    const previewTargets = {
        department: document.getElementById('preview-department'),
        document_type: document.getElementById('preview-document-type'),
        course_title: document.getElementById('preview-course-title'),
        course_code: document.getElementById('preview-course-code'),
        submitted_to_name: document.getElementById('preview-submitted-to-name'),
        submitted_to_designation: document.getElementById('preview-submitted-to-designation'),
        submitted_to_department: document.getElementById('preview-submitted-to-department'),
        submitted_by_name: document.getElementById('preview-submitted-by-name'),
        submitted_by_id: document.getElementById('preview-submitted-by-id'),
        submitted_by_batch: document.getElementById('preview-submitted-by-batch'),
        submitted_by_department: document.getElementById('preview-submitted-by-department')
    };

    if (!form || !resetButton || !downloadButton || !statusElement || !coverPaper) {
        return;
    }

    const applyPlaceholders = () => {
        Object.entries(fallbacks).forEach(([key, value]) => {
            const field = form.elements.namedItem(key);
            if (field && !field.getAttribute('placeholder')) {
                field.setAttribute('placeholder', value);
            }
        });
    };

    const updatePreview = () => {
        Object.entries(previewTargets).forEach(([key, element]) => {
            if (!element) {
                return;
            }

            const field = form.elements.namedItem(key);
            const value = field ? String(field.value).trim() : '';
            element.textContent = value || fallbacks[key] || '\u00A0';
        });
    };

    const setStatus = (message, isError = false) => {
        statusElement.textContent = message;
        statusElement.style.color = isError ? '#dc2626' : '#4361ee';
    };

    const createFilename = () => {
        const courseField = form.elements.namedItem('course_title');
        const source = courseField ? String(courseField.value).trim() : '';
        const slug = source
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);

        return slug ? `wub-${slug}-cover-page.pdf` : 'wub-cover-page.pdf';
    };

    const waitForImages = async () => {
        const images = Array.from(coverPaper.querySelectorAll('img'));

        await Promise.all(images.map((image) => {
            if (image.complete) {
                return Promise.resolve();
            }

            return new Promise((resolve) => {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
            });
        }));
    };

    const downloadPdf = async () => {
        const html2canvas = window.html2canvas;
        const jsPdfConstructor = window.jspdf && window.jspdf.jsPDF;

        if (!html2canvas || !jsPdfConstructor) {
            setStatus('PDF export library failed to load. Please refresh and try again.', true);
            return;
        }

        downloadButton.disabled = true;
        setStatus('Generating your single-page PDF...');
        document.body.classList.add('is-exporting');

        try {
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
            }

            await waitForImages();

            await new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });

            const rect = coverPaper.getBoundingClientRect();
            const canvas = await html2canvas(coverPaper, {
                scale: 3,
                useCORS: true,
                backgroundColor: '#ffffff',
                scrollX: 0,
                scrollY: 0,
                width: Math.ceil(rect.width),
                height: Math.ceil(rect.height),
                windowWidth: Math.ceil(document.documentElement.clientWidth),
                windowHeight: Math.ceil(document.documentElement.clientHeight)
            });

            const pdfWidth = 210;
            const pdfHeight = 297;
            const canvasAspectRatio = canvas.width / canvas.height;
            const pageAspectRatio = pdfWidth / pdfHeight;
            let renderWidth = pdfWidth;
            let renderHeight = pdfHeight;
            let offsetX = 0;
            let offsetY = 0;

            if (canvasAspectRatio > pageAspectRatio) {
                renderHeight = pdfWidth / canvasAspectRatio;
                offsetY = (pdfHeight - renderHeight) / 2;
            } else if (canvasAspectRatio < pageAspectRatio) {
                renderWidth = pdfHeight * canvasAspectRatio;
                offsetX = (pdfWidth - renderWidth) / 2;
            }

            const pdf = new jsPdfConstructor({
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait',
                compress: true
            });

            pdf.addImage(
                canvas.toDataURL('image/png'),
                'PNG',
                offsetX,
                offsetY,
                renderWidth,
                renderHeight,
                undefined,
                'FAST'
            );
            pdf.save(createFilename());

            setStatus('Your PDF download has started.');
        } catch (error) {
            console.error('Cover page PDF generation failed:', error);
            setStatus('Could not generate the PDF. Please try again.', true);
        } finally {
            document.body.classList.remove('is-exporting');
            downloadButton.disabled = false;
        }
    };

    form.addEventListener('input', updatePreview);

    resetButton.addEventListener('click', () => {
        form.reset();
        updatePreview();
        setStatus('Fields cleared. The preview keeps the example text until you start typing.');
    });

    downloadButton.addEventListener('click', downloadPdf);

    applyPlaceholders();
    form.reset();
    updatePreview();
    setStatus('');
});
