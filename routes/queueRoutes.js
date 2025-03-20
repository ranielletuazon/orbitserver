import express from "express";
import { getQueue, joinQueue, leaveQueue } from "../controllers/queueController.js";

const router = express.Router();

router.get("/queue", getQueue);
router.post("/joinQueue", joinQueue);
router.post("/leaveQueue", leaveQueue);

export default router;
