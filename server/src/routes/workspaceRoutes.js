/**
 * server/src/routes/workspaceRoutes.js
 */
const router = require("express").Router();
const wsCtrl = require("../controllers/workspaceController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect); // all workspace routes require auth

router.get("/", wsCtrl.list);
router.post("/", wsCtrl.create);
router.patch("/:id", wsCtrl.update);
router.delete("/:id", wsCtrl.remove);

module.exports = router;