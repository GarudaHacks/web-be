const {db} = require("../config/firebase");

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
exports.createUser = async (req, res) => {
  try {
    const requiredFields = ["email", "firstName", "lastName"];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({error: `Missing required field: ${field}`});
      }
    }

    const userData = formatUser(req.body);
    const userRef = await db.collection("users").add({...userData});
    res.json({success: true, userId: userRef.id});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
};

/**
 * Fetch all users from Firestore
 */
exports.getUsers = async (req, res) => {
  try {
    const snapshot = await db.collection("users").get();
    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(users);
  } catch (error) {
    res.status(500).json({error: error.message});
  }
};
