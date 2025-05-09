const express = require("express");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const axios = require("axios");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
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
    let akses = await helpers.checkUserAccess(Username, 1, 10);
    if (!akses) return res.redirect("/");
    let menu = await helpers.generateMenu(Username);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, Username);
        return item;
      })
    );
    return res.render("banner/banner", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      menu,
      open: 1,
      active: 10,
      csrfToken: req.csrfToken(),
      constants,
    });
  },
  getDataBanner: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let getDataBanner = (
      await helpers.doQuery(
        db,
        `SELECT ID, Name, Image_Banner, Image_Mobile, AllowedF FROM leaderboard_banner WHERE WebsiteID = '${process.env.websiteID}'`
      )
    ).results;
    return res.json({
      data: getDataBanner,
    });
  },
  getAddBanner: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    res.render(
      "banner/modals/addBanner",
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
  addBanner: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let name = req.body.name;
    let images = req.files;
    let imageDekstop = "";
    let imageMobile = "";
    let base_url = process.env.base_url;
    images.find((image) => {
      if (image.fieldname === "imageBanner") {
        imageDekstop = image.filename;
        imageDekstop = `${base_url}/uploads/banner/desktop/${imageDekstop}`;
      } else {
        imageMobile = image.filename;
        imageMobile = `${base_url}/uploads/banner/mobile/${imageMobile}`;
      }
    });
    db.query(
      `INSERT INTO leaderboard_banner (Name, Image_Banner, Image_Mobile, AllowedF, WebsiteID, CDate, CUserID) VALUES (?,?,?,?,?,?,?)`,
      [
        name,
        imageDekstop,
        imageMobile,
        1,
        process.env.websiteID,
        formatDate(new Date()),
        req.session.ID,
      ],
      function (err) {
        if (err) {
          console.log(err);
          req.flash("error", "Failed to add banner");
          return res.status(202).json({ status: false });
        }
        req.flash("success", "Banner added successfully");
        return res.status(200).json({ status: true });
      }
    );
  },
  updateStatusBanner: async function (req, res) {
    if (!req.session.ID) {
      return res.status(403).json({ logout: "/logout" });
    }
    let ID = req.body.ID;
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT AllowedF FROM leaderboard_banner WHERE ID = ${ID}`
      )
    ).results[0];
    if (getData.AllowedF === 1) {
      db.query(
        `UPDATE leaderboard_banner SET AllowedF = 0 WHERE ID = ?`,
        [ID],
        function (err) {
          if (err) {
            console.log(err);
            return res.status(202).json({ status: false });
          }
          return res.status(200).json({ status: true });
        }
      );
    } else {
      db.query(
        `UPDATE leaderboard_banner SET AllowedF = 1 WHERE ID = ?`,
        [ID],
        function (err) {
          if (err) {
            console.log(err);
            return res.status(202).json({ status: false });
          }
          return res.status(200).json({ status: true });
        }
      );
    }
  },
  getDeleteBanner: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let ID = req.body.ID;
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT * FROM leaderboard_banner WHERE ID = ${ID}`
      )
    ).results[0];
    res.render(
      "banner/modals/deleteBanner",
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
  deleteBanner: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let ID = req.body.ID;
    let queryDataBanner = `SELECT Image_Banner, Image_Mobile FROM leaderboard_banner WHERE ID = ${ID}`;
    let getDataBanner = (await helpers.doQuery(db, queryDataBanner)).results;
    let imageMobile = getDataBanner[0].Image_Mobile;
    let imageDesktop = getDataBanner[0].Image_Banner;
    imageMobile = imageMobile.split("/").pop();
    imageDesktop = imageDesktop.split("/").pop();
    let pathMobile = path.join(
      __dirname,
      "..",
      "public",
      "uploads",
      "banner",
      "mobile",
      imageMobile
    );
    let pathDesktop = path.join(
      __dirname,
      "..",
      "public",
      "uploads",
      "banner",
      "desktop",
      imageDesktop
    );
    fs.unlink(pathMobile, (err) => {
      if (err) {
        return console.log(err);
      }
      fs.unlink(pathDesktop, (err) => {
        if (err) {
          return console.log(err);
        }
        db.query(
          `DELETE FROM leaderboard_banner WHERE ID = ?`,
          [req.body.ID],
          function (err) {
            if (err) {
              console.log(err);
              req.flash("error", "Failed to delete banner");
              return res.status(202).json({ status: false });
            }
            req.flash("success", "Banner deleted successfully");
            return res.status(200).json({ status: true });
          }
        );
      });
    });
  },
};
