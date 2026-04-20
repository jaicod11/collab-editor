/**
 * routes/authRoutes.js
 */
const router     = require("express").Router();
const authCtrl   = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

router.post("/register", authCtrl.register);
router.post("/login",    authCtrl.login);
router.get( "/me",       protect, authCtrl.me);
router.post("/logout",   protect, authCtrl.logout);

module.exports = router;
