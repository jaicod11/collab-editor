/**
 * server/src/routes/authRoutes.js — updated
 * Added three routes for the Settings page.
 */
const router = require("express").Router();
const authCtrl = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

router.post("/register", authCtrl.register);
router.post("/login", authCtrl.login);
router.get("/me", protect, authCtrl.me);
router.patch("/me", protect, authCtrl.updateProfile);   // ← new: update name/bio
router.patch("/password", protect, authCtrl.changePassword);  // ← new: change password
router.delete("/me", protect, authCtrl.deleteAccount);   // ← new: delete account
router.post("/logout", protect, authCtrl.logout);

module.exports = router;