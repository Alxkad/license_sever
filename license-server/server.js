const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const PORT = 3000;

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Session configuration
app.use(
  session({
    secret: 'your-secret-key', // Replace with a secure secret key
    resave: false,
    saveUninitialized: true,
  })
);

// File path to store license data
const licensesFilePath = path.join(__dirname, 'licenses.json');
const adminFilePath = path.join(__dirname, 'admin.json');

// Load licenses from file
function loadLicenses() {
  if (!fs.existsSync(licensesFilePath)) {
    fs.writeFileSync(licensesFilePath, '[]');
  }
  const licensesData = fs.readFileSync(licensesFilePath);
  return JSON.parse(licensesData);
}

// Save licenses to file
function saveLicenses(licenses) {
  fs.writeFileSync(licensesFilePath, JSON.stringify(licenses, null, 2));
}

// Load admin credentials
function loadAdminCredentials() {
  if (!fs.existsSync(adminFilePath)) {
    const defaultAdmin = { username: 'admin', password: 'password' }; // Default credentials
    fs.writeFileSync(adminFilePath, JSON.stringify(defaultAdmin, null, 2));
  }
  const adminData = fs.readFileSync(adminFilePath);
  return JSON.parse(adminData);
}

// Generate a random license key
function generateLicenseKey() {
  return crypto.randomBytes(8).toString('hex').toUpperCase();
}

// Middleware to check if the user is logged in
function checkAuth(req, res, next) {
  if (req.session.loggedIn) {
    return next();
  } else {
    res.redirect('/login');
  }
}

// Login page
app.get('/login', (req, res) => {
  res.render('login', { message: null });
});

// Handle login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const adminCredentials = loadAdminCredentials();

  if (
    username === adminCredentials.username &&
    password === adminCredentials.password
  ) {
    req.session.loggedIn = true;
    res.redirect('/');
  } else {
    res.render('login', { message: 'Invalid credentials' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return console.log(err);
    }
    res.redirect('/login');
  });
});

// Home page - list all licenses
app.get('/', checkAuth, (req, res) => {
  const licenses = loadLicenses();
  res.render('index', { licenses });
});

// Create license page
app.get('/create', checkAuth, (req, res) => {
  res.render('create');
});

// Handle license creation
app.post('/create', checkAuth, (req, res) => {
  const { email, expirationDate } = req.body;
  const licenses = loadLicenses();
  const licenseKey = generateLicenseKey();
  const newLicense = {
    email,
    licenseKey,
    expirationDate,
    status: 'active',
    macAddress: '', // Initially empty
  };
  licenses.push(newLicense);
  saveLicenses(licenses);
  res.redirect('/');
});

// Validate license
app.post('/validate', (req, res) => {
  const { email, licenseKey, macAddress } = req.body;
  const licenses = loadLicenses();
  const license = licenses.find(
    (l) => l.licenseKey === licenseKey && l.email === email
  );

  if (!license) {
    return res.status(404).json({ message: 'License not found' });
  }

  const currentDate = new Date().toISOString().split('T')[0];
  if (currentDate > license.expirationDate) {
    return res.status(400).json({ message: 'License expired' });
  }

  // Check if the license has been activated before
  if (!license.macAddress) {
    // First-time activation, no MAC address required
    if (macAddress) {
      // Store MAC address anonymously
      license.macAddress = macAddress;
      saveLicenses(licenses);
    }
    return res.status(200).json({ message: 'License validated successfully' });
  }

  // Verify MAC address for subsequent activations
  if (license.macAddress !== macAddress) {
    return res.status(403).json({ message: 'MAC address mismatch' });
  }

  return res.status(200).json({ message: 'License validated successfully' });
});

app.listen(PORT, () => {
  console.log(`License server running on http://localhost:${PORT}`);
});
