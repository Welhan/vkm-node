const express = require("express");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const axios = require("axios");
const { db } = require("../configs/db");
const helpers = require("../helpers/helpers");
const { constants } = require("../configs/constants");
dotenv.config();

function formatDate(date, dateTime = true, delimiter = true) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  if (dateTime) {
    if (delimiter) {
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } else {
      return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }
  } else {
    return `${year}-${month}-${day}`;
  }
}

module.exports = {
  index: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let Username = req.session.Username;
    let akses = await helpers.checkUserAccess(Username, 5, 15);
    if (!akses) return res.redirect("/");
    let menu = await helpers.generateMenu(Username);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, Username);
        return item;
      })
    );
    return res.render("regis_player/index", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      menu,
      open: 5,
      active: 15,
      csrfToken: req.csrfToken(),
      constants,
    });
  },
  getDataPlayer: async function (req, res) {
    if (!req.session.ID) {
      return res.status(200).json({ logout: "/logout" });
    }

    let loyalty = req.body.loyalty;
    let username = req.body.username;
    let startDate = req.body.startDate.split("/").reverse().join("-");
    let endDate = req.body.endDate.split("/").reverse().join("-");
    let query =
      "SELECT A.*, B.Username AS Admin FROM user A left join admin B on A.CUserID = B.ID WHERE 1";
    let queryParams = [];
    if (startDate && endDate) {
      query += " AND DATE_FORMAT(A.CreatedDate, '%Y-%m-%d') BETWEEN ? AND ?";
      queryParams.push(startDate, endDate);
    } else if (startDate) {
      query += " AND DATE_FORMAT(A.CreatedDate, '%Y-%m-%d') = ?";
      queryParams.push(startDate);
    } else if (endDate) {
      query += " AND DATE_FORMAT(A.CreatedDate, '%Y-%m-%d') = ?";
      queryParams.push(endDate);
    }

    if (loyalty) {
      query += " AND A.Loyalty = ?";
      queryParams.push(loyalty);
    }

    if (username) {
      query += " AND Username LIKE ?";
      queryParams.push("%" + username + "%");
    }

    query += " ORDER BY ID DESC";

    let getDataPlayer = (await helpers.doQuery(db, query, queryParams)).results;
    return res.json({
      data: getDataPlayer,
    });
  },
  getFromNew: async function (req, res) {
    if (!req.session.ID) {
      return res.status(200).json({ logout: "/logout" });
    }
    res.render(
      "regis_player/modals/newModal",
      { layout: false, csrfToken: req.csrfToken() },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  checkUsername: async function (req, res) {
    if (!req.session.ID) {
      return res.status(200).json({ logout: "/logout" });
    }
    let Username = req.body.Username || "";
    let dateNow = formatDate(new Date());
    let token = `W${process.env.websiteID}|${Username}||${dateNow}`;
    token = Buffer.from(token).toString("base64");
    let suggestions = new Array();
    let BracketURL = await helpers.getURLBracket();
    if (BracketURL) {
      await axios
        .post(
          BracketURL + "player-api",
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        )
        .then((response) => {
          let data = {};
          if (response.data.player == true) {
            data = {
              id: response.data.username,
              text: response.data.phone,
            };
          } else {
            data = {
              id: "",
              text: "",
            };
          }
          suggestions.push(data);
        })
        .catch((err) => {
          let data = {
            id: "",
            text: "",
          };
          suggestions.push(data);
        });
      return res.json(suggestions);
    }
  },
  addPlayer: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let Username = helpers.escapeHtml(req.body.Username);
    let Phone = helpers.escapeHtml(req.body.Phone);
    let Password = req.body.Password;
    let error = {};
    if (!Username) {
      error.Username = "Username wajib diisi";
    }
    if (!Phone) {
      error.Phone = "Phone wajib diisi";
    }
    if (!Password) {
      error.Password = "Kata Sandi wajib diisi";
    }

    let checkUsernameExist = (
      await helpers.doQuery(db, `SELECT * FROM user WHERE Username = ?`, [
        Username,
      ])
    ).results;

    if (checkUsernameExist.length > 0) {
      error.Username = "Username sudah terdaftar";
    }

    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }

    Password = await bcrypt.hash(Password, 10);
    db.query(
      `INSERT INTO user (Username, Password, ResetF, Phone, WebsiteID, CreatedDate, CUserID) VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
      [Username, Password, 1, Phone, process.env.websiteID, req.session.ID],
      function (err) {
        if (err) {
          console.error("Error inserting data:", err);
          req.flash("error", "Player gagal ditambahkan!");
          return res.status(202).json({ status: false });
        }
        req.flash("success", "Player berhasil ditambahkan!");
        return res.status(200).json({ status: true });
      }
    );
  },
  getResetPassword: async function (req, res) {
    if (!req.session.ID) {
      return res.status(200).json({ logout: "/logout" });
    }
    let id = req.body.id;
    let getData = (
      await helpers.doQuery(db, `SELECT * FROM user WHERE ID = ${id}`)
    ).results[0];
    res.render(
      "regis_player/modals/resetPassword",
      { layout: false, csrfToken: req.csrfToken(), data: getData },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  resetPassword: async function (req, res) {
    if (!req.session.ID) {
      return res.status(200).json({ logout: "/logout" });
    }
    let id = req.body.id;
    let Password = req.body.Password;
    let error = {};

    if (!Password) {
      error.Password = "Kata Sandi wajib diisi";
    }

    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }

    Password = await bcrypt.hash(Password, 10);
    db.query(
      `UPDATE user SET Password = ?, ResetF = 1, UpdatedDate = NOW(), Last_User = ? WHERE ID = ?`,
      [Password, req.session.ID, id],
      function (err) {
        if (err) {
          req.flash("error", "Password Player gagal diubah!");
          return res.status(202).json({ status: false });
        }
        req.flash("success", "Password Player berhasil diubah!");
        return res.status(200).json({ status: true });
      }
    );
  },
};
