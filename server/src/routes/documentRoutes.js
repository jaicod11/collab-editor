/**
 * server/src/routes/documentRoutes.js — updated
 * Added the /leave route so "Remove me" on Shared with Me actually works.
 */
const router = require("express").Router();
const docCtrl = require("../controllers/documentController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect); // all document routes require auth

router.get("/", docCtrl.list);
router.post("/", docCtrl.create);
router.get("/:id", docCtrl.getOne);
router.patch("/:id", docCtrl.update);
router.patch("/:id/leave", docCtrl.leave);   // ← new: remove self from collaborators
router.delete("/:id", docCtrl.remove);

module.exports = router;