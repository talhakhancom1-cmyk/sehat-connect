function generatePdfStub(content) {
  return {
    type: 'pdf_stub',
    generatedAt: new Date().toISOString(),
    content
  };
}

module.exports = {
  generatePdfStub
};
