/**
 * server/src/routes/notificationRoutes.js
 *
 * Every route is scoped to the authenticated user inside the controller; there
 * is no owner/collaborator check to make because a notification belongs to
 * exactly one person.
 */
const router = require("express").Router();
const notifCtrl = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect); // all notification routes require auth

router.get("/", notifCtrl.list);
router.post("/read-all", notifCtrl.markAllRead); // before /:id so it is not read as an id
router.patch("/:id/read", notifCtrl.markRead);

module.exports = router;
