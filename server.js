require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(cors());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log('✅ Supabase client initialized');

function generateRefCode() {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `DEL-${year}-${random}`;
}

// =============================================================================
// AUTH
// =============================================================================
app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: 'All fields are required' });
  const { data: existing } = await db.from('users').select('id').eq('email', email).single();
  if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });
  const { data, error } = await db.from('users').insert({ name, email, password, role: 'staff' }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to create account' });
  res.status(201).json({ success: true, message: 'Account created successfully', userId: data.id });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });
  const { data, error } = await db.from('users').select('id,name,email,role').eq('email', email).eq('password', password).single();
  if (error || !data) return res.status(401).json({ success: false, message: 'Invalid email or password' });
  res.json({ success: true, message: 'Login successful', user: { id: data.id, name: data.name, email: data.email, role: data.role || 'staff' } });
});

// =============================================================================
// FURNITURE
// =============================================================================
app.get('/products', async (req, res) => {
  const { data, error } = await db.from('furniture').select('*').order('id', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch furniture', error: error.message });
  res.json({ success: true, data });
});

app.get('/products/:id', async (req, res) => {
  const { data, error } = await db.from('furniture').select('*').eq('id', req.params.id).single();
  if (error || !data) return res.status(404).json({ success: false, message: 'Furniture not found' });
  res.json({ success: true, data });
});

app.post('/add-product', async (req, res) => {
  const { name, category, price, material, dimensions, description, image } = req.body;
  if (!name || !category || !price) return res.status(400).json({ success: false, message: 'Name, category, and price are required' });
  const { data, error } = await db.from('furniture').insert({ name, category, price, material: material || '', dimensions: dimensions || '', description: description || '', image: image || '' }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to add furniture' });
  res.status(201).json({ success: true, message: 'Furniture added successfully', id: data.id });
});

app.put('/products/:id', async (req, res) => {
  const { name, category, price, material, dimensions, description, image } = req.body;
  const { error } = await db.from('furniture').update({ name, category, price, material, dimensions, description, image }).eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to update furniture' });
  res.json({ success: true, message: 'Furniture updated successfully' });
});

app.delete('/products/:id', async (req, res) => {
  const { error } = await db.from('furniture').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete furniture' });
  res.json({ success: true, message: 'Furniture deleted successfully' });
});

// =============================================================================
// INVENTORY
// =============================================================================
app.get('/inventory', async (req, res) => {
  const { data, error } = await db.from('inventory').select('*').order('last_updated', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch inventory' });
  res.json({ success: true, data });
});

app.post('/inventory', async (req, res) => {
  const { name, category, quantity, item_code, image } = req.body;
  if (!name || !category || quantity === undefined || !item_code) {
    return res.status(400).json({ success: false, message: 'Name, item code, category, and quantity are required' });
  }
  const { data, error } = await db.from('inventory').insert({
    name,
    category,
    quantity,
    item_code,
    image: image || null
  }).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'Item code already exists. Please use a unique item code.' });
    return res.status(500).json({ success: false, message: 'Failed to add inventory item' });
  }
  res.status(201).json({ success: true, message: 'Inventory item added successfully', id: data.id });
});

app.put('/inventory/:id', async (req, res) => {
  const { name, category, quantity, item_code, image } = req.body;
  if (!name || !category || quantity === undefined || !item_code) {
    return res.status(400).json({ success: false, message: 'Name, item code, category, and quantity are required' });
  }
  const { error } = await db.from('inventory').update({
    name,
    category,
    quantity,
    item_code,
    image: image || null,
    last_updated: new Date()
  }).eq('id', req.params.id);
  if (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'Item code already exists. Please use a unique item code.' });
    return res.status(500).json({ success: false, message: 'Failed to update inventory' });
  }
  res.json({ success: true, message: 'Inventory updated successfully' });
});

app.delete('/inventory/:id', async (req, res) => {
  const { error } = await db.from('inventory').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete inventory item' });
  res.json({ success: true, message: 'Inventory item deleted successfully' });
});

// =============================================================================
// DELIVERIES
// =============================================================================
app.get('/deliveries', async (req, res) => {
  const { data, error } = await db.from('deliveries').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch deliveries' });
  res.json({ success: true, data });
});

app.get('/deliveries/track/:refCode', async (req, res) => {
  const { data, error } = await db.from('deliveries').select('*').eq('ref_code', req.params.refCode).single();
  if (error || !data) return res.status(404).json({ success: false, message: 'Delivery not found' });
  res.json({ success: true, data });
});

app.get('/deliveries/stats', async (req, res) => {
  const { data, error } = await db.from('deliveries').select('status');
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch delivery statistics' });
  const stats = { pending: 0, processing: 0, in_transit: 0, delivered: 0 };
  data.forEach(row => {
    const key = row.status.toLowerCase().replace(/ /g, '_');
    if (stats.hasOwnProperty(key)) stats[key]++;
  });
  res.json({ success: true, data: stats });
});

app.post('/deliveries', async (req, res) => {
  const { customer_name, contact_number, address, product, status, delivery_type, delivery_date } = req.body;
  if (!customer_name || !address) return res.status(400).json({ success: false, message: 'Customer name and address are required' });
  const ref_code = generateRefCode();
  const { data, error } = await db.from('deliveries').insert({ ref_code, customer_name, contact_number: contact_number || null, address, product: product || 'N/A', status: status || 'Pending', delivery_type: delivery_type || 'Outbound', delivery_date: delivery_date || null }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to create delivery' });
  res.status(201).json({ success: true, message: 'Delivery created successfully', id: data.id, ref_code });
});

app.put('/deliveries/:id', async (req, res) => {
  const { customer_name, contact_number, address, product, status, delivery_type, delivery_date } = req.body;
  const { error } = await db.from('deliveries').update({ customer_name, contact_number, address, product, status, delivery_type, delivery_date }).eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to update delivery' });
  res.json({ success: true, message: 'Delivery updated successfully' });
});

app.patch('/deliveries/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Pending', 'Processing', 'In Transit', 'Delivered'];
  if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
  const { error } = await db.from('deliveries').update({ status }).eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to update delivery status' });
  res.json({ success: true, message: 'Delivery status updated successfully' });
});

app.delete('/deliveries/:id', async (req, res) => {
  const { error } = await db.from('deliveries').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete delivery' });
  res.json({ success: true, message: 'Delivery deleted successfully' });
});

// =============================================================================
// SEND SMS (Admin & Manager Delivery Dashboards) — via Semaphore
// =============================================================================
app.post('/deliveries/:id/send-sms', async (req, res) => {
  try {
    const { data: delivery, error: fetchError } = await db.from('deliveries').select('*').eq('id', req.params.id).single();
    if (fetchError || !delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });

    if (!delivery.contact_number) {
      return res.status(400).json({ success: false, message: 'Cannot send SMS: customer has no contact number.' });
    }

    // Validate the number matches an acceptable Philippine mobile format (Semaphore's own examples use 09XXXXXXXXX)
    const cleanedNumber = delivery.contact_number.replace(/[^0-9]/g, '');
    const isValidPhoneNumber = /^(09\d{9}|639\d{9})$/.test(cleanedNumber);
    if (!isValidPhoneNumber) {
      return res.status(400).json({ success: false, message: 'Cannot send SMS: invalid contact number format.' });
    }

    if (!process.env.SEMAPHORE_API_KEY) {
      console.error('❌ [Semaphore] SEMAPHORE_API_KEY is missing in .env configuration.');
      return res.status(500).json({ success: false, message: 'SMS service is not configured.' });
    }

    const message = `Hello ${delivery.customer_name}, your furniture delivery with reference ${delivery.ref_code} is currently ${delivery.status || 'Pending'}.\n\nThank you for choosing Modern Koncept Furniture Centre.`;

    const params = new URLSearchParams({
      apikey: process.env.SEMAPHORE_API_KEY,
      number: cleanedNumber,
      message: message
    });

    const smsResponse = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const smsResult = await smsResponse.json();

    // Semaphore returns an array of message objects; a "Failed" status means the network rejected it
    const failed = !smsResponse.ok || (Array.isArray(smsResult) && smsResult[0] && smsResult[0].status === 'Failed');
    if (failed) {
      console.error('❌ [Semaphore] SMS send failed:', smsResult);
      return res.status(502).json({ success: false, message: 'Failed to send SMS. Please try again.' });
    }

    console.log(`✅ [Semaphore] SMS sent for delivery ${delivery.ref_code}`);
    res.json({ success: true, message: 'SMS sent successfully.' });

  } catch (err) {
    console.error('❌ [Semaphore] Error sending SMS:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send SMS. Please try again.' });
  }
});

// =============================================================================
// SALES
// =============================================================================
app.get('/sales', async (req, res) => {
  const { data, error } = await db.from('sales').select('*').order('sale_date', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch sales' });
  res.json({ success: true, data });
});

app.post('/sales', async (req, res) => {
  const { customer_name, product_name, amount, sale_date } = req.body;
  if (!customer_name || !product_name || !amount) return res.status(400).json({ success: false, message: 'Customer name, product name, and amount are required' });
  const { data, error } = await db.from('sales').insert({ customer_name, product_name, amount, sale_date: sale_date || new Date() }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to add sales record' });
  res.status(201).json({ success: true, message: 'Sales record added successfully', id: data.id });
});

app.put('/sales/:id', async (req, res) => {
  const { customer_name, product_name, amount, sale_date } = req.body;
  if (!customer_name || !product_name || !amount) return res.status(400).json({ success: false, message: 'All fields required' });
  const { error } = await db.from('sales').update({ customer_name, product_name, amount, sale_date }).eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to update sales record' });
  res.json({ success: true, message: 'Sales record updated successfully' });
});

app.delete('/sales/:id', async (req, res) => {
  const { error } = await db.from('sales').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete sales record' });
  res.json({ success: true, message: 'Sales record deleted successfully' });
});

app.get('/sales/monthly', async (req, res) => {
  const { data, error } = await db.from('sales').select('sale_date, amount');
  if (error) return res.status(500).json({ error: 'Failed to fetch monthly sales data' });
  const grouped = {};
  data.forEach(row => {
    const d = new Date(row.sale_date);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (!grouped[key]) grouped[key] = { month: d.getMonth() + 1, year: d.getFullYear(), total: 0 };
    grouped[key].total += parseFloat(row.amount);
  });
  res.json(Object.values(grouped).sort((a, b) => a.year - b.year || a.month - b.month));
});

// =============================================================================
// REVIEWS
// =============================================================================
app.get('/reviews', async (req, res) => {
  const { data, error } = await db.from('reviews').select('*').order('review_date', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  res.json({ success: true, data });
});

app.post('/reviews', async (req, res) => {
  const { product_name, reviewer_name, rating, review_text, review_date } = req.body;
  if (!product_name || !reviewer_name || !rating || !review_text) return res.status(400).json({ success: false, message: 'All fields are required' });
  const { data, error } = await db.from('reviews').insert({ product_name, reviewer_name, rating, review_text, review_date: review_date || new Date() }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to add review' });
  res.status(201).json({ success: true, message: 'Review added successfully', id: data.id });
});

app.put('/reviews/:id', async (req, res) => {
  const { product_name, review_text, review_date } = req.body;
  if (!product_name || !review_text) return res.status(400).json({ success: false, message: 'Product name and text are required' });
  const updateData = { product_name, review_text };
  if (review_date) updateData.review_date = review_date;
  const { error } = await db.from('reviews').update(updateData).eq('id', req.params.id);
  if (error) {
    console.error('Review update error:', JSON.stringify(error));
    return res.status(500).json({ success: false, message: error.message || error.details || error.hint || JSON.stringify(error) || 'Failed to update review' });
  }
  res.json({ success: true, message: 'Review updated successfully' });
});

app.delete('/reviews/:id', async (req, res) => {
  const { error } = await db.from('reviews').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete review' });
  res.json({ success: true, message: 'Review deleted successfully' });
});

// =============================================================================
// BUSINESS INFO
// =============================================================================
app.get('/business-info', async (req, res) => {
  const { data, error } = await db.from('business_info').select('*').eq('id', 1).single();
  if (error || !data) return res.json({ success: true, data: { hero_title: 'About ECL FURNITURE MART', hero_description: 'We offer complete line of ready made home and office furnitures.', story: '', mission: '', return_policy: '', warranty_policy: '', delivery_policy: '', payment_policy: '' } });
  res.json({ success: true, data });
});

app.post('/business-info', async (req, res) => {
  const { hero_title, hero_description, story, mission, return_policy, warranty_policy, delivery_policy, payment_policy } = req.body;
  const { data: existing } = await db.from('business_info').select('id').eq('id', 1).single();
  if (!existing) {
    const { error } = await db.from('business_info').insert({ id: 1, hero_title, hero_description, story, mission, return_policy, warranty_policy, delivery_policy, payment_policy });
    if (error) return res.status(500).json({ success: false, message: 'Failed to save business info' });
  } else {
    const { error } = await db.from('business_info').update({ hero_title, hero_description, story, mission, return_policy, warranty_policy, delivery_policy, payment_policy, updated_at: new Date() }).eq('id', 1);
    if (error) return res.status(500).json({ success: false, message: 'Failed to update business info' });
  }
  res.json({ success: true, message: 'Business information saved successfully' });
});

app.get('/contact-info', async (req, res) => {
  const { data, error } = await db.from('contact_info').select('*').eq('id', 1).single();
  if (error || !data) return res.json({ success: true, data: { phone: '(044) 796-1234', email: 'info@eclfurniture.com', address: 'REAL BLDG 1 JP RIZAL STREET Poblacion Sta Maria Bulacan', business_hours: 'Mon-Sat: 9:00 AM - 6:00 PM' } });
  res.json({ success: true, data });
});

app.post('/contact-info', async (req, res) => {
  const { phone, email, address, business_hours } = req.body;
  const { data: existing } = await db.from('contact_info').select('id').eq('id', 1).single();
  if (!existing) {
    const { error } = await db.from('contact_info').insert({ id: 1, phone, email, address, business_hours });
    if (error) return res.status(500).json({ success: false, message: 'Failed to save contact info' });
  } else {
    const { error } = await db.from('contact_info').update({ phone, email, address, business_hours, updated_at: new Date() }).eq('id', 1);
    if (error) return res.status(500).json({ success: false, message: 'Failed to update contact info' });
  }
  res.json({ success: true, message: 'Contact information saved successfully' });
});

// =============================================================================
// STAFF/MANAGER ACCOUNTS
// =============================================================================
app.get('/staff', async (req, res) => {
  const { data, error } = await db.from('users').select('id,name,email,role,created_at').neq('role', 'admin').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch staff accounts' });
  res.json({ success: true, data });
});

app.post('/staff', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
  const accountRole = role === 'manager' ? 'manager' : 'staff';
  const { data: existing } = await db.from('users').select('id').eq('email', email).single();
  if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });
  const { data, error } = await db.from('users').insert({ name, email, password, role: accountRole }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to create account' });
  res.status(201).json({ success: true, message: `${accountRole.charAt(0).toUpperCase() + accountRole.slice(1)} account created successfully`, id: data.id });
});

app.delete('/staff/:id', async (req, res) => {
  const { error } = await db.from('users').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete account' });
  res.json({ success: true, message: 'Account deleted successfully' });
});

// =============================================================================
// CHATBOT Q&A
// =============================================================================
app.get('/chatbot', async (req, res) => {
  const { data, error } = await db.from('chatbot_qa').select('*').order('category').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch chatbot Q&As' });
  res.json({ success: true, data });
});

app.post('/chatbot', async (req, res) => {
  const { question, answer, category } = req.body;
  if (!question || !answer) return res.status(400).json({ success: false, message: 'Question and answer are required' });
  const { data, error } = await db.from('chatbot_qa').insert({ question, answer, category: category || 'General' }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to add Q&A' });
  res.status(201).json({ success: true, message: 'Q&A added successfully', id: data.id });
});

app.put('/chatbot/:id', async (req, res) => {
  const { question, answer, category } = req.body;
  const { error } = await db.from('chatbot_qa').update({ question, answer, category: category || 'General', updated_at: new Date() }).eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to update Q&A' });
  res.json({ success: true, message: 'Q&A updated successfully' });
});

app.delete('/chatbot/:id', async (req, res) => {
  const { error } = await db.from('chatbot_qa').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete Q&A' });
  res.json({ success: true, message: 'Q&A deleted successfully' });
});

// =============================================================================
// CUSTOMER INQUIRIES
// =============================================================================
app.get('/inquiries', async (req, res) => {
  const { data, error } = await db.from('customer_inquiries').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch inquiries' });
  res.json({ success: true, data });
});

app.post('/inquiries', async (req, res) => {
  const { customer_name, email, phone, subject, message } = req.body;
  if (!customer_name || !email || !message) return res.status(400).json({ success: false, message: 'Name, email, and message are required' });
  const { data, error } = await db.from('customer_inquiries').insert({ customer_name, email, phone: phone || null, subject: subject || 'General', message }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to submit inquiry' });
  res.status(201).json({ success: true, message: 'Inquiry submitted successfully', id: data.id });
});

app.put('/inquiries/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['new', 'read', 'replied'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
  const { error } = await db.from('customer_inquiries').update({ status }).eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to update status' });
  res.json({ success: true, message: 'Status updated successfully' });
});

app.delete('/inquiries/:id', async (req, res) => {
  const { error } = await db.from('customer_inquiries').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete inquiry' });
  res.json({ success: true, message: 'Inquiry deleted successfully' });
});

// =============================================================================
// CUSTOMER FEEDBACK
// =============================================================================
app.get('/feedback', async (req, res) => {
  const { data, error } = await db.from('customer_feedback').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch feedback' });
  res.json({ success: true, data });
});

app.post('/feedback', async (req, res) => {
  const { customer_name, email, product_name, rating, feedback_text } = req.body;
  if (!customer_name || !feedback_text) return res.status(400).json({ success: false, message: 'Name and feedback are required' });
  const { data, error } = await db.from('customer_feedback').insert({ customer_name, email: email || null, product_name: product_name || null, rating: rating || 3, feedback_text }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to submit feedback' });
  res.status(201).json({ success: true, message: 'Feedback submitted successfully', id: data.id });
});

app.delete('/feedback/:id', async (req, res) => {
  const { error } = await db.from('customer_feedback').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete feedback' });
  res.json({ success: true, message: 'Feedback deleted successfully' });
});

// =============================================================================
// AI VISUALIZATION — Gemini
// =============================================================================
app.post('/api/visualize', async (req, res) => {
  try {
    const { furnitureId, style, roomImage, placementInstructions } = req.body;
    if (!furnitureId || !roomImage) return res.status(400).json({ success: false, message: 'Furniture ID and room image are required.' });
    if (!placementInstructions || !placementInstructions.trim()) return res.status(400).json({ success: false, message: 'Please describe where to place the furniture.' });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ success: false, message: 'GEMINI_API_KEY is missing in .env configuration.' });

    const { data: furniture, error: furnitureError } = await db.from('furniture').select('*').eq('id', furnitureId).single();
    if (furnitureError || !furniture) return res.status(404).json({ success: false, message: 'Furniture item not found.' });

    const cleanBase64 = roomImage.replace(/^data:image\/\w+;base64,/, '');
    const prompt = `You are an expert AI interior designer. Edit the uploaded room photo by adding this product: ${furniture.name} (${furniture.description || 'Modern design item'}, Material: ${furniture.material || 'Premium finish'}). Style: ${style || 'Modern'}. Placement: ${placementInstructions.trim()}. Generate a photorealistic edited version with the product naturally placed, matching existing lighting and perspective.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [prompt, { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } }],
        config: { responseModalities: ['IMAGE', 'TEXT'] }
      });
      const parts = response.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find(p => p.inlineData);
      if (!imagePart) return res.status(500).json({ success: false, message: 'Gemini did not return an image. Try again.' });
      return res.json({ success: true, image: `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`, furnitureName: furniture.name });
    } catch (aiError) {
      console.error('❌ [Gemini] Error:', aiError.message);
      return res.status(500).json({ success: false, message: 'Gemini processing failed. Please try again.' });
    }
  } catch (err) {
    console.error('❌ Unexpected Error:', err.message);
    return res.status(500).json({ success: false, message: 'Unexpected server error.' });
  }
});

// =============================================================================
// START SERVER
// =============================================================================
app.listen(PORT, () => {
  console.log('==============================================');
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log('==============================================');
});