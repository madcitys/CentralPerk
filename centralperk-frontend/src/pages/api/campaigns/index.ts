import type { NextApiHandler } from "next";
import { campaignsHandler, campaignsListHandler } from "../../../server/campaign-api";

const handler: NextApiHandler = (req, res) => {
  if (req.method?.toUpperCase() === "GET") {
    return campaignsListHandler(req, res);
  }

  return campaignsHandler(req, res);
};

export default handler;
