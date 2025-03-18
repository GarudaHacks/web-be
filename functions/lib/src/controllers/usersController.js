"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsers = exports.createUser = void 0;
const firebase_1 = require("../config/firebase");
/**
 * Helper for standardizing user data
 */
const formatUser = (data) => ({
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    email: data.email || "",
    dateOfBirth: data.dateOfBirth || "",
    school: data.school || "",
    grade: data.grade || null,
    year: data.year || null,
    genderIdentity: data.genderIdentity || "",
    status: data.status || "",
    portfolio: data.portfolio || "",
    github: data.github || "",
    linkedin: data.linkedin || "",
    admin: data.admin || false,
});
/**
 * Creates new user in Firestore
 */
const createUser = async (req, res) => {
    try {
        const requiredFields = ["email", "firstName", "lastName"];
        for (const field of requiredFields) {
            if (!req.body[field]) {
                res.status(400).json({ error: `Missing required field: ${field}` });
                return;
            }
        }
        const userData = formatUser(req.body);
        const userRef = await firebase_1.db.collection("users").add(Object.assign({}, userData));
        res.json({ success: true, userId: userRef.id });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.createUser = createUser;
/**
 * Fetch all users from Firestore
 */
const getUsers = async (req, res) => {
    try {
        const snapshot = await firebase_1.db.collection("users").get();
        const users = snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};
exports.getUsers = getUsers;
//# sourceMappingURL=usersController.js.map