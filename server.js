const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt'); 
const jwt = require('jsonwebtoken'); 

const app = express();
// Render assigns a dynamic port, so we must use process.env.PORT
const PORT = process.env.PORT || 3000; 
const JWT_SECRET = 'super_secret_ifa_key_2026'; 

app.use(express.json());
app.use(cors());

// ==========================================
// 1. DATABASE CONNECTION
// ==========================================
const mongoURI = 'mongodb+srv://sadhik:github2521@schoolmanagementsystem.cfkbn3c.mongodb.net/ifa_portal?appName=SchoolManagementSystem';

mongoose.connect(mongoURI)
    .then(() => console.log('✅ Connected to MongoDB Atlas successfully!'))
    .catch(err => console.error('❌ MongoDB connection error:', err));


// ==========================================
// 2. DATABASE SCHEMAS
// ==========================================
const workSchema = new mongoose.Schema({ title: String, type: String, grade: String }, { _id: false });

const StudentProfile = mongoose.model('StudentProfile', new mongoose.Schema({
    name: String, email: String, major: String, enrollmentDate: String, recentWork: [workSchema]
}));

const StaffProfile = mongoose.model('StaffProfile', new mongoose.Schema({
    name: String, email: String, department: String, title: String, classesTaught: [String]
}));

const AdminProfile = mongoose.model('AdminProfile', new mongoose.Schema({
    name: String, email: String, office: String, permissions: [String]
}));

const User = mongoose.model('User', new mongoose.Schema({
    role: String,
    username: { type: String, required: true, unique: true }, 
    password: { type: String, required: true }, 
    profileId: mongoose.Schema.Types.ObjectId 
}));

// ==========================================
// 3. AUTO-SEED DATABASE
// ==========================================
async function seedDatabase() {
    try {
        const userCount = await User.countDocuments();
        
        if (userCount === 0) {
            console.log("Empty database detected. Generating initial admin account...");

            const hashedAdminPassword = await bcrypt.hash('12345', 10);
            
            const adminData = await AdminProfile.create({ 
                name: 'System Admin', 
                email: 'admin@ifa.edu', 
                permissions: ['All']
            });

            await User.create({ 
                role: 'admin', 
                username: 'admin', 
                password: hashedAdminPassword, 
                profileId: adminData._id 
            });

            console.log("✅ Initial Admin created (Username: admin, Password: 12345)");
        } else {
            console.log("📊 Database already contains data. Skipping reset.");
        }
    } catch (error) {
        console.error("❌ Error during startup:", error);
    }
}
seedDatabase();

// ==========================================
// 4. SECURE API ENDPOINTS
// ==========================================
app.post('/login', async (req, res) => {
    const { role, username, password } = req.body;

    try {
        // Case-insensitive search for username
        const user = await User.findOne({ 
            role, 
            username: { $regex: new RegExp(`^${username}$`, 'i') } 
        });
        
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) return res.status(401).json({ message: 'Invalid credentials' });

        let profileData = null;
        if (role === 'student') profileData = await StudentProfile.findById(user.profileId);
        else if (role === 'staff') profileData = await StaffProfile.findById(user.profileId);
        else if (role === 'admin') profileData = await AdminProfile.findById(user.profileId);

        const token = jwt.sign(
            { userId: user._id, role: user.role, profileId: user.profileId }, 
            JWT_SECRET, { expiresIn: '2h' }
        );

        res.status(200).json({ 
            message: 'Authentication successful', token: token, 
            user: { id: user.profileId, role: user.role, name: profileData.name } 
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error during authentication' });
    }
});

app.post('/api/users/add', async (req, res) => {
    const { role, username, password, name, email, major, department } = req.body;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: 'Register Number / Username already taken' });

        const hashedPassword = await bcrypt.hash(password, 10);

        let savedProfile;
        if (role === 'student') {
            savedProfile = await StudentProfile.create({ 
                name, email, major: major || 'Undeclared', enrollmentDate: new Date().toLocaleDateString(), recentWork: [] 
            });
        } else if (role === 'staff') {
            savedProfile = await StaffProfile.create({ 
                name, email, department: department || 'General Faculty', classesTaught: [] 
            });
        } else if (role === 'admin') {
            savedProfile = await AdminProfile.create({ name, email, permissions: [] });
        }

        await User.create({
            role, username, password: hashedPassword, profileId: savedProfile._id
        });

        res.status(201).json({ message: `${role.toUpperCase()} account created successfully!` });

    } catch (error) {
        res.status(500).json({ message: 'Database error' });
    }
});

app.get('/api/student/:id', async (req, res) => {
    try {
        const profile = await StudentProfile.findById(req.params.id);
        if (profile) res.status(200).json(profile);
        else res.status(404).json({ message: 'Profile not found' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// 5. START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Secure Server is running on port ${PORT}`);
});