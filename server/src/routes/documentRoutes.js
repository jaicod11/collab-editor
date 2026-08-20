/**
 * server/src/routes/documentRoutes.js — updated
 * Added the /leave route so "Remove me" on Shared with Me actually works.
 */
const router = require("express").Router();
const docCtrl = require("../controllers/documentController");
const shareCtrl = require("../controllers/shareController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect); // all document routes require auth, including share links

// ── Share links ───────────────────────────────────────────────────────────────
// Declared before "/:id" so "join" is never mistaken for a document id.
// A token lets a signed-in user ASK for access; it is not access itself.
router.get("/join/:token", shareCtrl.resolveToken);
router.post("/join/:token", shareCtrl.requestAccess);

router.get("/", docCtrl.list);
router.post("/", docCtrl.create);
router.get("/:id", docCtrl.getOne);
router.patch("/:id", docCtrl.update);
router.patch("/:id/leave", docCtrl.leave);   // remove self from collaborators
router.delete("/:id", docCtrl.remove);

// Per-user stars — any level of access is enough to star for yourself.
router.put("/:id/star", docCtrl.star);
router.delete("/:id/star", docCtrl.unstar);

// ── Sharing & collaborator management ─────────────────────────────────────────
// Every handler below re-checks ownership itself (documentService.assertOwner);
// being an existing collaborator is never sufficient.
router.post("/:id/share", shareCtrl.enableShare);          // [owner]
router.delete("/:id/share", shareCtrl.revokeShare);        // [owner]

router.get("/:id/requests", shareCtrl.listRequests);                       // [owner]
router.post("/:id/requests/:reqId/approve", shareCtrl.approveRequest);     // [owner]
router.post("/:id/requests/:reqId/deny", shareCtrl.denyRequest);           // [owner]

router.get("/:id/collaborators", shareCtrl.listCollaborators);             // any access
router.patch("/:id/collaborators/:userId", shareCtrl.setCollaboratorRole); // [owner]
router.delete("/:id/collaborators/:userId", shareCtrl.removeCollaborator); // [owner]

module.exports = router;