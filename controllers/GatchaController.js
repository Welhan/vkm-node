const express = require("express");
const axios = require("axios");
const helpers = require("../helpers/helpers");
const { constants } = require("../configs/constants");
const { db } = require("../configs/db");

const formatDate = (date) => {
  let d = new Date(date);
  let month = "" + (d.getMonth() + 1);
  let day = "" + d.getDate();
  let year = d.getFullYear();

  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;

  return [year, month, day].join("-");
};

module.exports = {
  index: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let akses = await helpers.checkUserAccess(Username, 1, 14);
    if (!akses) return res.redirect("/");
    let menu = await helpers.generateMenu(Username);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, Username);
        return item;
      })
    );
    let role = (
      await helpers.doQuery(
        db,
        `SELECT Role From admin WHERE Username = '${Username}'`
      )
    ).results;

    return res.render("gatcha/gatcha", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      menu,
      active: 14,
      open: 1,
      csrfToken: req.csrfToken(),
      constants,
      role: role.length > 0 ? role[0] : "",
    });
  },
  getData: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let akses = await helpers.checkUserAccess(Username, 1, 14);
    if (!akses) return res.redirect("/");

    let loyalty = req.body.loyalty;

    let query = `SELECT A.*, B.Username AS CreatedBy FROM gatcha_prize A LEFT JOIN admin B ON A.CUserID = B.ID WHERE 1=1`;
    let queryParams = [];
    if (loyalty) {
      query += " AND Level = ?";
      queryParams.push(loyalty);
    }
    query += " ORDER BY ID DESC";
    let result = (await helpers.doQuery(db, query, queryParams)).results;

    let role = (
      await helpers.doQuery(
        db,
        `SELECT Role From admin WHERE Username = '${Username}'`
      )
    ).results;

    return res.json({
      data: result,
      role,
    });
  },
  getNew: async function (req, res) {
    if (!req.session.ID) {
      return res.status(200).json({ redirect: "/logout" });
    }
    let Username = req.session.Username;
    let akses = await helpers.checkUserAccess(Username, 1, 14);
    if (!akses) {
      return res.status(200).json({ redirect: "/" });
    }

    let quests = (
      await helpers.doQuery(db, "SELECT * FROM quests WHERE AllowedF = 1")
    ).results;

    let maxQuests = (
      await helpers.doQuery(
        db,
        'SELECT Value FROM config WHERE Config = "Max Quest"'
      )
    ).results;

    res.render(
      "gatcha/modals/newModal",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        quests: quests,
        maxQuest:
          maxQuests.length > 0
            ? maxQuests[0].Value
              ? maxQuests[0].Value
              : 0
            : 0,
      },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
          return res.status(500).json({ error: "Error rendering template" });
        }
        return res.json({ view: html });
      }
    );
  },
  newGatcha: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let akses = await helpers.checkUserAccess(Username, 1, 13);
    if (!akses) return res.redirect("/");
    let level = req.body.level;
    let prizes = [].concat(req.body.prize);
    let values = [].concat(req.body.probability);
    let error = {};

    console.log("prizes", prizes);
    console.log("values", values);

    if (prizes.filter((el) => el !== "" && el !== undefined).length < 1) {
      error.global = "Tidak Ada Quest Yang Dipilih";
    }

    if (values.length !== prizes.length) {
      error.global = "Terdapat Value atau Hadiah yang Kosong";
    }

    if (!level) {
      error.global = "Level Gatcha tidak boleh kosong";
    }

    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }

    let checkGatcha = (
      await helpers.doQuery(
        db,
        `SELECT * FROM gatcha_prize WHERE Level = ? AND WebsiteID = ?`,
        [level, process.env.websiteID]
      )
    ).results;

    if (checkGatcha.length > 0) {
      db.query(
        `UPDATE gatcha_prize SET Prize = ?, Probability = ?, Last_Date = NOW(), Last_User = ? WHERE Level = ? AND WebsiteID = ?`,
        [
          prizes.join(","),
          values.join(","),
          req.session.ID,
          level,
          process.env.websiteID,
        ],
        function (err) {
          if (err) {
            console.error(err);
            req.flash("error", "Hadiah Gatcha Gagal Diubah");
            return res.status(202).send(false);
          }
          req.flash("success", "Hadiah Gatcha Berhasil Diubah");
          return res.status(200).send(true);
        }
      );
    } else {
      db.query(
        `INSERT INTO gatcha_prize (WebsiteID, Level, Prize, Probability, CUserID, CDate) VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          process.env.websiteID,
          level,
          prizes.join(","),
          values.join(","),
          req.session.ID,
        ],
        function (err) {
          if (err) {
            console.error(err);
            req.flash("error", "Hadiah Gatcha Gagal Ditambahkan");
            return res.status(202).send(false);
          }
          req.flash("success", "Hadiah Gatcha Berhasil Ditambahkan");
          return res.status(200).send(true);
        }
      );
    }
  },
  getFormEdit: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let akses = await helpers.checkUserAccess(Username, 1, 13);
    if (!akses) return res.redirect("/");

    let id = req.body.id;

    let quests = (
      await helpers.doQuery(db, "SELECT * FROM quests WHERE AllowedF = 1")
    ).results;

    let maxQuests = (
      await helpers.doQuery(
        db,
        'SELECT Value FROM config WHERE Config = "Max Quest"'
      )
    ).results;

    res.render(
      "weeklyQuest/modals/editModal",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        quests: quests,
        maxQuest:
          maxQuests.length > 0
            ? maxQuests[0].Value
              ? maxQuests[0].Value
              : 0
            : 0,
      },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
          return res.status(500).json({ error: "Error rendering template" });
        }
        return res.json({ view: html });
      }
    );
  },
  getFormConfirmation: async function (req, res) {
    if (!req.session.ID) {
      return res.status(200).json({ redirect: "/logout" });
    }
    let Username = req.session.Username;
    let akses = await helpers.checkUserAccess(Username, 1, 13);
    if (!akses) {
      return res.status(200).json({ redirect: "/" });
    }

    let id = req.body.id;
    let status = req.body.status;

    let query = "Select * from quest_website WHERE ID = ?";

    let quest = (await helpers.doQuery(db, query, [id])).results;

    res.render(
      "weeklyQuest/modals/confirmationModal",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        data: quest,
        status,
      },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
          return res.status(500).json({ error: "Error rendering template" });
        }
        return res.json({ view: html });
      }
    );
  },
  confirmQuest: async function (req, res) {
    if (!req.session.ID) {
      return res.status(200).json({ redirect: "/logout" });
    }
    let Username = req.session.Username;
    let akses = await helpers.checkUserAccess(Username, 1, 13);
    if (!akses) {
      return res.status(200).json({ redirect: "/" });
    }

    let error = {};
    let Status = ["APPROVED", "REJECTED"];
    let status = req.body.status;
    let remarks = req.body.remarks;
    let id = req.body.id;
    let query = "SELECT * FROM quest_website WHERE ID = ?";

    let checkData = (await helpers.doQuery(db, query, [id])).results;

    if (checkData.length > 0) {
      if (checkData[0].ApproveF !== "PENDING") {
        error.global = "Misi Sudah diterima / ditolak";
      }
    } else {
      error.global = "Misi Tidak Dituemukan";
    }

    if (!Status.includes(status)) {
      error.global = "Status tidak valid";
    }

    if (status === "REJECTED") {
      if (!remarks) {
        error.remarks = "Alasan penolakan harus diisi";
      }
    }

    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }

    db.query(
      `UPDATE quest_website SET ApproveF = ?, Remarks = ?, ApproveBy = ?, ApproveDate = NOW(), Last_Date = NOW(), Last_User = ? WHERE ID = ?`,
      [status.toUpperCase(), remarks, req.session.ID, req.session.ID, id],
      function (err) {
        if (err) {
          console.error(err);
          error.global = "Proses Gagal. Silahkan Coba Kembali!";
          return res.json({ error: error });
        }

        return res.json({ status: true });
      }
    );
  },
  getFormEdit: async function (req, res) {
    if (!req.session.ID) {
      return res.status(200).json({ redirect: "/logout" });
    }
    let Username = req.session.Username;
    let akses = await helpers.checkUserAccess(Username, 1, 13);
    if (!akses) {
      return res.status(200).json({ redirect: "/" });
    }

    let id = req.body.id;
  },
};
