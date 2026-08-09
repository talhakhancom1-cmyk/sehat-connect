// Client-side prescription PDF generator (jspdf). Produces a signed Rx document
// the patient can download or share with a pharmacy.
import { jsPDF } from 'jspdf';

export const generatePrescriptionPdf = (presc) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a5' });
  const W = doc.internal.pageSize.getWidth();
  const M = 32;
  let y = 40;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SehatConnect', M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Digital Prescription', W - M, y, { align: 'right' });
  y += 6;
  doc.setDrawColor(220);
  doc.line(M, y, W - M, y);
  y += 18;

  // Doctor / patient block
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Dr. ${presc.doctor_name || ''}`, M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(presc.doctor_specialty || 'General Physician', M, y + 13);
  y += 30;
  doc.text(`Patient: ${presc.patient_name || ''}`, M, y);
  doc.text(`Date: ${presc.date || ''}`, W - M, y, { align: 'right' });
  y += 16;

  if (presc.diagnosis) {
    doc.setFont('helvetica', 'bold');
    doc.text('Diagnosis', M, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(presc.diagnosis, W - M * 2);
    doc.text(lines, M, y + 13);
    y += 13 + lines.length * 12 + 8;
  }

  // Rx symbol + medications
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Rx', M, y);
  y += 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  (presc.medications || []).forEach((med, i) => {
    y += 16;
    doc.setFont('helvetica', 'bold');
    doc.text(`${i + 1}. ${med.name || ''} ${med.dosage || ''}`, M, y);
    doc.setFont('helvetica', 'normal');
    y += 12;
    doc.text(`${med.frequency || ''}  ·  ${med.duration || ''}`, M + 14, y);
    if (med.instructions) {
      const il = doc.splitTextToSize(med.instructions, W - M * 2 - 14);
      y += 12;
      doc.setTextColor(110);
      doc.text(il, M + 14, y);
      doc.setTextColor(20);
      y += il.length * 11;
    }
  });

  if (presc.notes) {
    y += 20;
    doc.setFont('helvetica', 'bold');
    doc.text('Notes', M, y);
    doc.setFont('helvetica', 'normal');
    const nl = doc.splitTextToSize(presc.notes, W - M * 2);
    doc.text(nl, M, y + 13);
    y += 13 + nl.length * 11;
  }

  if (presc.follow_up) {
    y += 14;
    doc.setTextColor(180, 90, 20);
    doc.text(`Follow up: ${presc.follow_up}`, M, y);
    doc.setTextColor(20);
  }

  // Signature line
  y = Math.max(y + 40, doc.internal.pageSize.getHeight() - 70);
  doc.setDrawColor(120);
  doc.line(W - M - 160, y, W - M, y);
  doc.setFontSize(9);
  doc.text(`Dr. ${presc.doctor_name || ''}`, W - M, y + 14, { align: 'right' });
  if (presc.is_signed && presc.signed_at) {
    doc.setTextColor(20, 120, 60);
    doc.setFont('helvetica', 'bold');
    doc.text('SIGNED', W - M, y + 28, { align: 'right' });
  } else {
    doc.setTextColor(150);
    doc.text('Awaiting signature', W - M, y + 28, { align: 'right' });
  }

  doc.save(`prescription-${(presc.id || 'draft').slice(0, 8)}.pdf`);
};