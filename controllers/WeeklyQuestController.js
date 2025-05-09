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
    let akses = await helpers.checkUserAccess(Username, 1, 13);
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

    let quests = (
      await helpers.doQuery(db, "SELECT Quest FROM quests WHERE AllowedF = 1")
    ).results;

    let maxQuests = (
      await helpers.doQuery(
        db,
        'SELECT Value FROM config WHERE Config = "Max Quest"'
      )
    ).results;
    return res.render("weeklyQuest/index", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      menu,
      active: 13,
      open: 1,
      csrfToken: req.csrfToken(),
      constants,
      role: role.length > 0 ? role[0] : "",
      quests: quests,
      maxQuest:
        maxQuests.length > 0
          ? maxQuests[0].Value
            ? maxQuests[0].Value
            : 0
          : 0,
    });
  },
  getData: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let akses = await helpers.checkUserAccess(Username, 1, 13);
    if (!akses) return res.redirect("/");

    let loyalty = "";
    let questID = "";
    let status = req.body.status;

    let query = `SELECT A.*, B.Username AS ApproveBy FROM quest_website A LEFT JOIN admin B ON A.ApproveBy = B.ID WHERE 1=1`;
    let queryParams = [];
    if (status) {
      query += " AND ApproveF = ?";
      queryParams.push(status);
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
  getFormMax: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let akses = await helpers.checkUserAccess(Username, 1, 13);
    if (!akses) return res.redirect("/");

    let quests = (
      await helpers.doQuery(db, "SELECT Quest FROM quests WHERE AllowedF = 1")
    ).results;

    let maxQuests = (
      await helpers.doQuery(
        db,
        'SELECT Value FROM config WHERE Config = "Max Quest"'
      )
    ).results;

    res.render(
      "weeklyQuest/modals/maxQuestModal",
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
  updateMaxQuest: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let akses = await helpers.checkUserAccess(Username, 1, 13);
    if (!akses) return res.redirect("/");

    let max = req.body.maxQuest;

    let data = (
      await helpers.doQuery(
        db,
        "Select Value FROM config WHERE Config = 'Max Quest'"
      )
    ).results;

    if (data.length > 0) {
      db.query(
        `UPDATE config set Value = ?, Last_Date = NOW() WHERE Config = 'Max Quest'`,
        [max],
        function (err) {
          if (err) {
            console.error(err);
            req.flash("error", "Gagal Menyimpan Max Quest");
            return res.status(202).json({ message: "failed" });
          }
          req.flash("success", "Berhasil Menyimpan Max Quest");
          return res.status(200).json({ message: "success" });
        }
      );
    } else {
      db.query(
        `INSERT INTO config (Config,Value,WebsiteID,CDate) VALUES ('Max Quest', ?, ?, NOW())`,
        [max, process.env.websiteID],
        function (err) {
          if (err) {
            console.error(err);
            req.flash("error", "Gagal Menyimpan Max Quest");
            return res.status(202).json({ message: "failed" });
          }
          req.flash("success", "Berhasil Menyimpan Max Quest");
          return res.status(200).json({ message: "success" });
        }
      );
    }
  },
  getNew: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let akses = await helpers.checkUserAccess(Username, 1, 13);
    if (!akses) return res.redirect("/");

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
      "weeklyQuest/modals/newModal",
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
  newQuest: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let akses = await helpers.checkUserAccess(Username, 1, 13);
    if (!akses) return res.redirect("/");
    let month = req.body.month;
    let week = req.body.week;
    let year = req.body.year;
    let quests = [].concat(req.body.weekly_quest);
    let bronzeValue = [].concat(req.body.bronzeValue ?? 0);
    let silverValue = [].concat(req.body.silverValue ?? 0);
    let goldValue = [].concat(req.body.goldValue ?? 0);
    let platinumValue = [].concat(req.body.platinumValue ?? 0);
    let diamondValue = [].concat(req.body.diamondValue ?? 0);

    let error = {};

    if (quests.filter((el) => el !== "" && el !== undefined).length < 1) {
      error.global = "Tidak Ada Quest Yang Dipilih";
    }

    bronzeValue = bronzeValue.map((value) => {
      return value
        .split(",")
        .map((v) => (v.trim() === "" ? 0 : parseInt(v, 10)));
    });

    if (bronzeValue.some((v) => v.includes(0))) {
      error.global = "Bronze Gatcha tidak boleh ada yang kosong";
    }

    if (quests.length !== bronzeValue.length) {
      error.global = "Terdapat Value atau Hadiah yang Kosong";
    }

    silverValue = silverValue.map((value) => {
      return value
        .split(",")
        .map((v) => (v.trim() === "" ? 0 : parseInt(v, 10)));
    });

    goldValue = goldValue.map((value) => {
      return value
        .split(",")
        .map((v) => (v.trim() === "" ? 0 : parseInt(v, 10)));
    });
    platinumValue = platinumValue.map((value) => {
      return value
        .split(",")
        .map((v) => (v.trim() === "" ? 0 : parseInt(v, 10)));
    });
    diamondValue = diamondValue.map((value) => {
      return value
        .split(",")
        .map((v) => (v.trim() === "" ? 0 : parseInt(v, 10)));
    });

    console.log(`Bronze Value: ${bronzeValue}`);
    console.log(`Silver Value: ${silverValue}`);
    console.log(`Gold Value: ${goldValue}`);
    console.log(`Platinum Value: ${platinumValue}`);
    console.log(`Diamond Value: ${diamondValue}`);

    for (let i = 0; i < silverValue.length; i++) {
      const silverRow = silverValue[i];
      const goldRow = goldValue[i];
      const platinumRow = platinumValue[i];
      const diamondRow = diamondValue[i];

      for (let j = 0; j < silverRow.length; j++) {
        if (
          silverRow[j] === 0 &&
          (goldRow[j] > 0 || platinumRow[j] > 0 || diamondRow[j] > 0)
        ) {
          error.global = `Target Silver pada Quest ke-${i + 1} diperlukan.`;
          break;
        }
        if (goldRow[j] === 0 && (platinumRow[j] > 0 || diamondRow[j] > 0)) {
          error.global = `Target Gold pada Quest ke-${i + 1} diperlukan.`;
          break;
        }
        if (platinumRow[j] === 0 && diamondRow[j] > 0) {
          error.global = `Target Platinum pada Quest ke-${i + 1} diperlukan.`;
          break;
        }
      }
    }

    console.log("Error:", error);
    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }

    const firstDayOfMonth = new Date(year, month - 1, 1);
    const firstDayOfWeek = firstDayOfMonth.getDay();

    let firstMondayDate = 1 + ((8 - firstDayOfWeek) % 7);
    if (firstDayOfWeek === 1) {
      firstMondayDate = 1;
    }

    const mondayDate = firstMondayDate + 7 * (week - 1);
    const monday = new Date(year, month - 1, mondayDate);
    let fromDate = formatDate(monday);

    const sunday = new Date(year, month - 1, mondayDate + 6);
    let endDate = formatDate(sunday);

    const maxDate = new Date(year, month, 0).getDate();
    if (mondayDate > maxDate) {
      return { error: "Minggu ke-" + week + " tidak valid di bulan ini" };
    }

    let questName = [];
    for (let [index, q] of quests.entries()) {
      let checkQuest = (
        await helpers.doQuery(
          db,
          `SELECT * FROM quests WHERE ID = ? AND AllowedF = 1`,
          [q]
        )
      ).results;

      if (checkQuest.length > 0) {
        questName.push(checkQuest[0].Quest);
      } else {
        quests.splice(index, 1);
      }
    }

    // return res.status(200).send(true);

    let checkWeekly = (
      await helpers.doQuery(
        db,
        `SELECT * FROM quest_website WHERE StartDate = ? AND EndDate = ? AND WebsiteID = ?`,
        [fromDate, endDate, process.env.websiteID]
      )
    ).results;
    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }
    if (checkWeekly.length > 0) {
      error.global = "Misi Mingguan Sudah Tersedia";
      return res.json({ error: error });
    } else {
      db.query(
        `INSERT INTO quest_website (WebsiteID, QuestID, Quest, BronzeValue, SilverValue, GoldValue, PlatinumValue, DiamondValue, StartDate, EndDate, CDate, CUserID) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [
          process.env.websiteID,
          quests.join(","),
          questName.join(","),
          bronzeValue,
          silverValue,
          goldValue,
          platinumValue,
          diamondValue,
          fromDate,
          endDate,
          req.session.ID,
        ],
        function (err) {
          if (err) {
            console.error(err);
            req.flash("error", "Misi Mingguan Gagal Ditambahkan");
            return res.status(202).send(false);
          }
          req.flash("success", "Misi Mingguan Berhasil Ditambahkan");
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
