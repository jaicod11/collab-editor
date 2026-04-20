/**
 * routes/documentRoutes.js
 */
const router  = require("express").Router();
const docCtrl = require("../controllers/documentController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect); // all document routes require auth

router.get(   "/",   docCtrl.list);
router.post(  "/",   docCtrl.create);
router.get(   "/:id",docCtrl.getOne);
router.patch( "/:id",docCtrl.update);
router.delete("/:id",docCtrl.remove);

module.exports = router;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * routes/historyRoutes.js  (mounted at /api/history in index.js,
 * but document-scoped paths are also used from documentRoutes)
 */
