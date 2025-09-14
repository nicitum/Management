const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const SALT_ROUNDS = 10;

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/') // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Accept only image files
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Login Route
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const [users] = await req.db.promise().query(
      'SELECT * FROM supermasters WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { username: user.username },
      process.env.JWT_SECRET,
     
    );

    res.json({
      message: 'Login successful',
      token,
      username: user.username,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', async (req, res) => {
  const { username } = req.body;

  try {
    await req.db.promise().query(
      'UPDATE supermasters SET logged_out_at = CURRENT_TIME WHERE username = ?',
      [username]
    );

    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change Password Route
router.post('/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const username = req.user.username;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long' });
  }

  try {
    const [users] = await req.db.promise().query(
      'SELECT * FROM supermasters WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    const isValidCurrentPassword = await bcrypt.compare(currentPassword, user.password);

    if (!isValidCurrentPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await req.db.promise().query(
      'UPDATE supermasters SET password = ? WHERE username = ?',
      [hashedNewPassword, username]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all clients
router.get('/clients', authenticateToken, async (req, res) => {
  try {
    const [clients] = await req.db.promise().query('SELECT * FROM clients');
    console.log("Decoded user from token:", req.user);

    res.json(clients);
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ error: 'Failed to fetch clients', details: error.message });
  }
});

// Image upload API
router.post('/upload-image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imageFileName = req.file.filename;

    // Delete old image if 'oldImage' is provided
    const oldImage = req.body.oldImage || req.query.oldImage;
    if (oldImage) {
      const oldImagePath = path.join('uploads', oldImage);
      if (fs.existsSync(oldImagePath)) {
        try {
          fs.unlinkSync(oldImagePath);
          console.log('Deleted old image:', oldImagePath);
        } catch (err) {
          console.error('Error deleting old image in upload-image API:', err);
        }
      }
    }

    res.status(200).json({
      message: 'Image uploaded successfully',
      imageFileName: imageFileName
    });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to upload image', details: error.message });
  }
});

// Get image API
router.get('/client-image/:imageFileName', async (req, res) => {
  try {
    const { imageFileName } = req.params;
    // Use absolute path to the uploads directory
    const imagePath = path.join('/OrderAppu/Management/uploads', imageFileName);
    
    // Check if file exists before sending
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.sendFile(imagePath);
  } catch (error) {
    console.error('Get image error:', error);
    res.status(500).json({ error: 'Failed to get image', details: error.message });
  }
});



router.get('/client_status/:client_name', async (req, res) => {
  try {
    const { client_name } = req.params;
    
    // Query with client name filter
    const [results] = await req.db.promise().query(
      'SELECT * FROM clients WHERE client_name LIKE ?',
      [`%${client_name}%`]
    );
    
    // Debug log to check if we're getting data
    console.log('Query results:', results);

    if (!results || results.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'No clients found with the given name'
      });
    }

    res.status(200).json({
      success: true,
      data: results
    });

  } catch (error) {
    // Detailed error logging
    console.error('Database error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Database error',
      error: error.message 
    });
  }
});


router.post('/add_client', authenticateToken, upload.single('image'), async (req, res) => {
  const {
    client_name,
    license_no,
    issue_date,
    expiry_date,
    status,
    duration,
    plan_name,
    customers_login,
    sales_mgr_login,
    superadmin_login,
    client_address,
    product_prefix,
    customer_prefix,
    sm_prefix,
    adv_timer,
    hsn_length,
    roles,
    ord_prefix,
    inv_prefix,
    ord_prefix_num,
    default_due_on,
    max_due_on
  } = req.body;


  if (!client_name || !license_no || !issue_date || !duration || !default_due_on || !max_due_on) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const imageFileName = req.file ? req.file.filename : null;

  // Store roles as a simple comma-separated string
  let rolesString = '';
  if (roles) {
    if (Array.isArray(roles)) {
      rolesString = roles.join(',');
    } else if (typeof roles === 'string') {
      rolesString = roles;
    }
  }

  const values = [
    client_name,
    license_no,
    issue_date,
    expiry_date || null,
    status || '',
    duration,
    plan_name || '',
    customers_login || '',
    sales_mgr_login || '',
    superadmin_login || '',
    client_address || '',
    product_prefix || '',
    customer_prefix || '',
    sm_prefix || '',
    adv_timer ? parseInt(adv_timer) : null,
    hsn_length ? parseInt(hsn_length) : null,
    rolesString,
    ord_prefix || '',
    inv_prefix || '',
    ord_prefix_num || '',
    default_due_on,
    max_due_on,
    imageFileName,
    created_at,
    updated_at
  ];

  try {
    const [result] = await req.db.promise().query(
      `INSERT INTO clients 
        (client_name, license_no, issue_date, expiry_date, status, duration, 
        plan_name, customers_login, sales_mgr_login, superadmin_login,
        client_address, product_prefix, customer_prefix, sm_prefix,
        adv_timer, hsn_length, roles, ord_prefix, inv_prefix, ord_prefix_num,
        default_due_on, max_due_on, image, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values
    );

    res.status(201).json({
      message: 'Client added successfully',
      client_id: result.insertId,
      imageFileName: imageFileName
    });
  } catch (error) {
    console.error('Add client error:', error);
    res.status(500).json({ error: 'Failed to add client', details: error.message });
  }
});

router.put('/update_client', authenticateToken, upload.single('image'), async (req, res) => {
  // DEBUG: Log all received data
  console.log('=== BACKEND DEBUG ===');
  console.log('req.body:', req.body);
  console.log('req.file:', req.file);
  console.log('=====================');

  const {
    client_id,
    client_name,
    license_no,
    issue_date,
    expiry_date,
    status,
    duration,
    plan_name,
    customers_login,
    sales_mgr_login,
    superadmin_login,
    client_address,
    product_prefix,
    customer_prefix,
    sm_prefix,
    adv_timer,
    hsn_length,
    roles,
    ord_prefix,
    inv_prefix,
    ord_prefix_num,
    default_due_on,
    max_due_on
  } = req.body;

  // DEBUG: Log extracted values
  console.log('=== EXTRACTED VALUES ===');
  console.log('client_id:', client_id);
  console.log('=======================');

  if (!client_id || !client_name || !license_no || !issue_date || !duration || !default_due_on || !max_due_on) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const imageFileName = req.file ? req.file.filename : (req.body.image || req.body.existingImage);

  let rolesString = '';
  if (roles) {
    if (Array.isArray(roles)) {
      rolesString = roles.join(',');
    } else if (typeof roles === 'string') {
      rolesString = roles;
    }
  }

  const values = [
    client_name,
    license_no,
    issue_date,
    expiry_date || null,
    status || '',
    duration,
    plan_name || '',
    customers_login || '',
    sales_mgr_login || '',
    superadmin_login || '',
    client_address || '',
    product_prefix || '',
    customer_prefix || '',
    sm_prefix || '',
    adv_timer ? parseInt(adv_timer) : null,
    hsn_length ? parseInt(hsn_length) : null,
    rolesString,
    ord_prefix || '',
    inv_prefix || '',
    ord_prefix_num || '',
    default_due_on,
    max_due_on,
    imageFileName,
    updated_at,
    client_id
  ];

  // DEBUG: Log the values array
  console.log('=== VALUES ARRAY ===');
  console.log('Values array length:', values.length);
  console.log('All values:', values);
  console.log('===================');

  try {
    const [result] = await req.db.promise().query(
      `UPDATE clients 
       SET client_name = ?,
           license_no = ?,
           issue_date = ?,
           expiry_date = ?,
           status = ?,
           duration = ?,
           plan_name = ?,
           customers_login = ?,
           sales_mgr_login = ?,
           superadmin_login = ?,
           client_address = ?,
           product_prefix = ?,
           customer_prefix = ?,
           sm_prefix = ?,
           adv_timer = ?,
           hsn_length = ?,
           roles = ?,
           ord_prefix = ?,
           inv_prefix = ?,
           ord_prefix_num = ?,
           default_due_on = ?,
           max_due_on = ?,
           image = ?,
           updated_at = ?
       WHERE client_id = ?`,
      values
    );

    console.log('=== UPDATE RESULT ===');
    console.log('Update result:', result);
    console.log('Affected rows:', result.affectedRows);
    console.log('====================');

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.status(200).json({
      message: 'Client updated successfully',
      client_id,
      imageFileName: imageFileName
    });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Failed to update client', details: error.message });
  }
});

router.get('/app_update/:client_id', authenticateToken, async (req, res) => {
  console.log('GET /app_update/:client_id - Request received');
  console.log('client_id:', req.params.client_id);
  
  const { client_id } = req.params;

  if (!client_id) {
    return res.status(400).json({ error: 'client_id is required' });
    
  }

  try {
    const [result] = await req.db.promise().query(
      'SELECT app_update, download_link FROM clients WHERE client_id = ?',
      [client_id]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.status(200).json({
      message: 'App update value retrieved successfully',
      client_id: parseInt(client_id),
      app_update: result[0].app_update,
      download_link: result[0].download_link
    });
  } catch (error) {
    console.error('Get app update error:', error);
    res.status(500).json({ error: 'Failed to get app_update', details: error.message });
  }
});



router.post('/app_update', authenticateToken, async (req, res) => {
  console.log('POST /app_update - Request received');
  console.log('Request body:', req.body);

  const { client_id, app_update, download_link } = req.body;

  // All fields are mandatory
  if (!client_id || !app_update || !download_link) {
    return res.status(400).json({ 
      error: 'client_id, app_update, and download_link are all required' 
    });
  }

  try {
    // Update both columns
    const [result] = await req.db.promise().query(
      'UPDATE clients SET app_update = ?, download_link = ? WHERE client_id = ?',
      [app_update, download_link, client_id]
    );

    console.log('Update result:', result);
    console.log('Affected rows:', result.affectedRows);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Return the updated values
    res.status(200).json({
      message: 'App update and download link updated successfully',
      client_id,
      app_update,
      download_link
    });
  } catch (error) {
    console.error('App update error:', error);
    res.status(500).json({ error: 'Failed to update app_update', details: error.message });
  }
});


module.exports = router;