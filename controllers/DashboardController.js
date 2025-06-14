const express = require("express");
const axios = require("axios");
const helpers = require("../helpers/helpers");
const { constants } = require("../configs/constants");
const { db } = require("../configs/db");

module.exports = {
  index: async function (req, res) {
    let UserID = req.session.UserID;
    if (!UserID) return res.redirect("/login");
    let menu = await helpers.generateMenu(UserID);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, UserID);
        return item;
      })
    );
    return res.render("index", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      menu,
      active: 0,
      open: 0,
      csrfToken: req.csrfToken(),
      constants,
    });
  },
  getDetailOTP: async function (req, res) {
    if (!req.session.ID) {
      return res.status(200).json({ redirect: "/logout" });
    }
    let UserID = process.env.UserIDOTP;
    await axios
      .post(constants.otp_url + "get-detail-otp", { UserID })
      .then((response) => {
        let data = {
          Username: response.data.Username,
          Phone: response.data.Phone,
        };
        return res.status(200).json(data);
      })
      .catch((err) => {
        let data = {};
        return res.status(202).json(data);
      });
  },
};
