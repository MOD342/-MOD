import { Router } from "express";
import geminiRoutes from "./gemini";
import adminAuthRoutes from "./adminAuth";
import systemRoutes from "./routes/systemRoutes";
import streamingRoutes from "./routes/streamingRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import animeCatalogRoutes from "./routes/animeCatalogRoutes";

export { IS_EXTERNAL_FETCH_DISABLED } from "./helpers/shared";

const router = Router();

router.use("/ai", geminiRoutes);
router.use("/admin", adminAuthRoutes);
router.use(systemRoutes);
router.use(streamingRoutes);
router.use(dashboardRoutes);
router.use(animeCatalogRoutes);

export default router;
