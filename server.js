const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt'); 
const jwt = require('jsonwebtoken'); 

const app = express();
const PORT = process.env.PORT || 3000; 
const JWT_SECRET = 'super_secret_ifa_key_2026'; 

// IMPORTANT: We increased the limit to 10mb so the server can accept image uploads!
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());

// ==========================================
// 1. DATABASE CONNECTION
// ==========================================
const mongoURI = 'mongodb+srv://sadhik:github2521@schoolmanagementsystem.cfkbn3c.mongodb.net/ifa_portal?appName=SchoolManagementSystem';

mongoose.connect(mongoURI)
    .then(() => console.log('✅ Connected to MongoDB Atlas successfully!'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ==========================================
// 2. DATABASE SCHEMAS (Updated with profilePhoto)
// ==========================================
const workSchema = new mongoose.Schema({ title: String, type: String, grade: String }, { _id: false });

const StudentProfile = mongoose.model('StudentProfile', new mongoose.Schema({
    name: String, email: String, major: String, enrollmentDate: String, profilePhoto: String, recentWork: [workSchema]
}));

const StaffProfile = mongoose.model('StaffProfile', new mongoose.Schema({
    name: String, email: String, department: String, title: String, profilePhoto: String, classesTaught: [String]
}));

const AdminProfile = mongoose.model('AdminProfile', new mongoose.Schema({
    name: String, email: String, office: String, profilePhoto: String, permissions: [String]
}));

const User = mongoose.model('User', new mongoose.Schema({
    role: String,
    username: { type: String, required: true, unique: true }, 
    password: { type: String, required: true }, 
    profileId: mongoose.Schema.Types.ObjectId 
}));

// ==========================================
// 3. SECURE API ENDPOINTS
// ==========================================

app.get('/', (req, res) => res.status(200).send('IFA Backend is awake!'));

app.post('/login', async (req, res) => {
    const { role, username, password } = req.body;
    try {
        const user = await User.findOne({ role, username: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) return res.status(401).json({ message: 'Invalid credentials' });

        let profileData = null;
        if (user.profileId && mongoose.Types.ObjectId.isValid(user.profileId)) {
            if (role === 'student') profileData = await StudentProfile.findById(user.profileId);
            else if (role === 'staff') profileData = await StaffProfile.findById(user.profileId);
            else if (role === 'admin') profileData = await AdminProfile.findById(user.profileId);
        }

        const token = jwt.sign({ userId: user._id, role: user.role, profileId: user.profileId }, JWT_SECRET, { expiresIn: '2h' });

        res.status(200).json({ 
            message: 'Authentication successful', token: token, 
            user: { id: user.profileId, role: user.role, name: profileData ? profileData.name : 'Unknown User' } 
        });
    } catch (error) { res.status(500).json({ message: 'Server error during authentication' }); }
});

app.post('/api/users/add', async (req, res) => {
    // Added profilePhoto to the incoming request
    const { role, username, password, name, email, major, department, profilePhoto } = req.body;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ message: 'Username already taken' });

        const hashedPassword = await bcrypt.hash(password, 10);
        let savedProfile;

        // Save the image string into the database
        if (role === 'student') {
            savedProfile = await StudentProfile.create({ name, email, major: major || 'Undeclared', enrollmentDate: new Date().toLocaleDateString(), profilePhoto: profilePhoto || '', recentWork: [] });
        } else if (role === 'staff') {
            savedProfile = await StaffProfile.create({ name, email, department: department || 'General Faculty', profilePhoto: profilePhoto || '', classesTaught: [] });
        } else if (role === 'admin') {
            savedProfile = await AdminProfile.create({ name, email, profilePhoto: profilePhoto || '', permissions: [] });
        }

        await User.create({ role, username, password: hashedPassword, profileId: savedProfile._id });
        res.status(201).json({ message: `${role.toUpperCase()} account created successfully!` });

    } catch (error) { res.status(500).json({ message: 'Database error' }); }
});

app.get('/api/student/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid ID' });
        const profile = await StudentProfile.findById(req.params.id);
        if (profile) res.status(200).json(profile);
        else res.status(404).json({ message: 'Profile not found' });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

app.get('/api/staff/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid ID' });
        const profile = await StaffProfile.findById(req.params.id);
        if (profile) res.status(200).json(profile);
        else res.status(404).json({ message: 'Profile not found' });
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

app.get('/api/users/all', async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'admin' } }); 
        let directory = [], studentCount = 0, staffCount = 0;

        for (let u of users) {
            let name = "Unknown", email = "Unknown";
            try {
                if (u.profileId && mongoose.Types.ObjectId.isValid(u.profileId)) {
                    if (u.role === 'student') {
                        const profile = await StudentProfile.findById(u.profileId);
                        if (profile) { name = profile.name; email = profile.email; }
                        studentCount++;
                    } else if (u.role === 'staff') {
                        const profile = await StaffProfile.findById(u.profileId);
                        if (profile) { name = profile.name; email = profile.email; }
                        staffCount++;
                    }
                }
            } catch (err) { console.error("Skipped corrupted user:", u.username); }
            directory.push({ name, username: u.username, email, role: u.role });
        }
        res.status(200).json({ stats: { students: studentCount, staff: staffCount }, directory });
    } catch (error) { res.status(500).json({ message: 'Error fetching directory data' }); }
});

app.delete('/api/users/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.role === 'admin') return res.status(403).json({ message: 'Cannot delete master admin' });

        if (user.role === 'student') await StudentProfile.findByIdAndDelete(user.profileId);
        else if (user.role === 'staff') await StaffProfile.findByIdAndDelete(user.profileId);

        await User.findByIdAndDelete(user._id);
        res.status(200).json({ message: 'User permanently deleted.' });
    } catch (error) { res.status(500).json({ message: 'Error deleting user' }); }
});

app.listen(PORT, () => console.log(`🚀 Secure Server is running on port ${PORT}`));
