/**
 * routes/historyRoutes.js
 * Mounted at /api/history in index.js
 */
const router      = require("express").Router();
const histCtrl    = require("../controllers/historyController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

// GET  /api/history/:id          → version history for a document
// POST /api/history/:id/restore/:revId → restore a version
router.get( "/:id",                   histCtrl.getHistory);
router.post("/:id/restore/:revId",    histCtrl.restore);

module.exports = router;
