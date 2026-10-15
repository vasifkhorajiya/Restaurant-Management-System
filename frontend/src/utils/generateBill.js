import jsPDF from 'jspdf';

// Builds a receipt-style PDF for one order and triggers a download.
// `order` needs: id, created_at, total_amount, items: [{name, quantity, price}]
// Optional: restaurant_name/address, customer_name, order_type, subtotal, discount_amount,
// coupon_code, tax_amount, delivery_fee, payment_method, payment_status.
export function generateBill(order) {
  const doc = new jsPDF({ unit: 'pt', format: 'a5' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 36;
  const right = pageWidth - marginX;
  let y = 46;
  const money = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;

  const line = () => { doc.setDrawColor(200); doc.line(marginX, y, right, y); };
  const row = (label, value, bold = false) => {
    y += 16;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, marginX, y);
    doc.text(value, right, y, { align: 'right' });
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(order.restaurant_name || 'Spice Route', pageWidth / 2, y, { align: 'center' });

  if (order.restaurant_address) {
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(order.restaurant_address, pageWidth / 2, y, { align: 'center' });
  }

  y += 22;
  line();

  y += 20;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Order #${String(order.id).padStart(4, '0')}`, marginX, y);
  doc.text(new Date(order.created_at).toLocaleString(), right, y, { align: 'right' });

  if (order.customer_name) { y += 16; doc.text(`Billed to: ${order.customer_name}`, marginX, y); }
  if (order.order_type) {
    y += 16;
    doc.text(`Type: ${order.order_type}${order.table_no ? ` (Table ${order.table_no})` : ''}`, marginX, y);
  }

  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.text('Item', marginX, y);
  doc.text('Qty', pageWidth - 150, y, { align: 'right' });
  doc.text('Price', right, y, { align: 'right' });
  y += 6;
  line();

  doc.setFont('helvetica', 'normal');
  order.items.forEach((item) => {
    y += 18;
    doc.text(String(item.name).slice(0, 34), marginX, y);
    doc.text(String(item.quantity), pageWidth - 150, y, { align: 'right' });
    doc.text(money(item.price * item.quantity), right, y, { align: 'right' });
  });

  y += 12;
  line();
  y += 4;
  doc.setFontSize(10);
  const hasBreakdown = order.subtotal !== undefined && Number(order.subtotal) > 0;
  if (hasBreakdown) {
    row('Item total', money(order.subtotal));
    if (Number(order.discount_amount) > 0) row(`Discount${order.coupon_code ? ` (${order.coupon_code})` : ''}`, `- ${money(order.discount_amount)}`);
    if (order.order_type === 'Delivery') row('Delivery fee', Number(order.delivery_fee) > 0 ? money(order.delivery_fee) : 'FREE');
    row('Taxes (5%)', money(order.tax_amount));
    y += 8;
    line();
  }

  y += 6;
  doc.setFontSize(12);
  row('Total', money(order.total_amount), true);

  if (order.payment_method) {
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    y += 10;
    doc.text(`Paid via ${order.payment_method} · ${order.payment_status || ''}`, marginX, y);
  }

  y += 30;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.text('Thanks for dining with us!', pageWidth / 2, y, { align: 'center' });

  doc.save(`bill-order-${order.id}.pdf`);
}
