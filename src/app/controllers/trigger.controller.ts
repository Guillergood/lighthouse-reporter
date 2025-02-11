import { Request, Response } from "express";
import { Document } from "mongoose";
import http from 'node:http';
import generateLighthoseReport from "../../services/lighthouse";
import { Error, GroupProps, TriggerCreateDto, TriggerDispatchDto, TypedRequestBody } from "../types";
import { isValidUrl } from "../utils/validations";
const Trigger = require("../models/trigger.model");
const Report = require("../models/report.model");

const TriggerController = {
  create: async (req: TypedRequestBody<TriggerCreateDto>, res: Response) => {
    const { name, pages, callbackUrl } = req.body;

    if (!name || !pages.length || !req?.userId) {
      return res
        .status(400)
        .send({ message: "Invalid json message received." });
    }

    if (callbackUrl && !isValidUrl(callbackUrl)) {
      return res
        .status(400)
        .json({ message: "Invalid callback url received." });
    }

    const trigger = await new Trigger({
      user: req.userId,
      name,
      pages,
      callbackUrl,
    });

    trigger.save((err: Error, trigger: Document<GroupProps>) => {
      if (err) {
        res.status(500).send({ message: err });
        return;
      }

      res.json({
        message: "Trigger was create successfully!",
        trigger,
      });
    });
  },
  show: (req: Request & { userId?: string }, res: Response) => {
    Trigger.find({
      user: req.userId,
    }).exec((err: Error, trigger: Document<GroupProps>[]) => {
      if (err) {
        console.log("err", err);
        res.status(500).send({ message: err });
        return;
      }

      if (!trigger) {
        return res.status(404).send({ message: "Trigger Not found." });
      }

      res.status(200).json({
        trigger,
      });
    });
  },
  dispatch: async (req: TypedRequestBody<TriggerDispatchDto>, res: Response) => {
    const trigger = await Trigger.find({
      user: req.userId,
      name: req.body.name,
    }).catch((err: Error) => {
      console.log("err", err);
      res.status(500).send({ message: err });
      return;
    });

    if (!trigger?.length) {
      return res.status(404).send({ message: "Trigger Not found." });
    }

    res.status(200).send({
      ok: true,
      message: "Trigger was dispatched successfully",
    });

    const data = await generateLighthoseReport(trigger[0].pages);

    console.log("Report data:\n", data);

    const repport = await Report({
      user: req.userId,
      name: trigger[0].name,
      data,
    });

    repport
      .save()
      .then(() => {
        console.log("Report saved");
      })
      .catch((err: Error) => {
        console.log("err", err);
      });

    if (trigger[0].callbackUrl) {
      const options = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
        },

      };
      const webhook = http.request(trigger[0].callbackUrl, options, (res) => {
        console.log(`Done triggering webhook callback statusCode: ${res.statusCode}`);
      });

      console.log(`Triggering webhook callback to: ${trigger[0].callbackUrl}`);

      webhook.write(JSON.stringify(data));

      webhook.on("error", (error) => {
        console.error(error);
      });
    }
  },
};

export default TriggerController;
