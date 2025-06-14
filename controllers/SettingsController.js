const express = require("express");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
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
    let UserID = req.session.UserID;
    let akses = await helpers.checkUserAccess(UserID, 2, 2);
    if (!akses) return res.redirect("/");
    let menu = await helpers.generateMenu(UserID);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, UserID);
        return item;
      })
    );

    let checkTahunImlek = (
      await helpers.doQuery(
        db,
        "SELECT * FROM settings WHERE Config = 'Tahun Imlek'"
      )
    ).results;

    let checkTahunImlek2 = (
      await helpers.doQuery(
        db,
        "SELECT * FROM settings WHERE Config = 'Tahun Imlek 2'"
      )
    ).results;
    let checkEndDate = (
      await helpers.doQuery(
        db,
        "SELECT * FROM settings WHERE Config = 'End Date'"
      )
    ).results;

    let config = {
      TahunImlek:
        checkTahunImlek.length > 0
          ? checkTahunImlek[0].Value
            ? checkTahunImlek[0].Value.toString()
            : ""
          : "",
      TahunImlek2:
        checkTahunImlek2.length > 0
          ? checkTahunImlek2[0].Value
            ? checkTahunImlek2[0].Value.toString()
            : ""
          : "",
      EndDate:
        checkEndDate.length > 0
          ? checkEndDate[0].Value
            ? checkEndDate[0].Value.toString()
            : ""
          : "",
    };
    return res.render("settings/settings", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      menu,
      open: 2,
      active: 2,
      csrfToken: req.csrfToken(),
      constants,
      config,
    });
  },
  updateSetting: async function (req, res) {
    if (!req.session.ID) {
      return res.status(200).json({ redirect: "/logout" });
    }

    let tahunMand1 = req.body.tahunMand1;
    let tahunMand2 = req.body.tahunMand2;
    let endDate = req.body.endDate;

    let checkTahunImlek = (
      await helpers.doQuery(
        db,
        "SELECT * FROM settings WHERE Config = 'Tahun Imlek'"
      )
    ).results;

    if (checkTahunImlek.length > 0) {
      db.query(
        "UPDATE settings SET Value = ? WHERE Config = ?",
        [tahunMand1, "Tahun Imlek"],
        (err) => {
          if (err) {
            console.error("Error updating Tahun Imlek:", err);
            return res.status(500).json({
              success: false,
              message: "Failed to update Tahun Imlek",
            });
          }
        }
      );
    } else {
      db.query(
        "INSERT INTO settings (Config, Value) VALUES (?, ?)",
        ["Tahun Imlek", tahunMand1],
        (err) => {
          if (err) {
            console.error("Error inserting Tahun Imlek:", err);
            return res.status(500).json({
              success: false,
              message: "Failed to insert Tahun Imlek",
            });
          }
        }
      );
    }

    let checkAksaraImlek = (
      await helpers.doQuery(
        db,
        "SELECT * FROM settings WHERE Config = 'Tahun Imlek 2'"
      )
    ).results;
    if (checkAksaraImlek.length > 0) {
      db.query(
        "UPDATE settings SET Value = ? WHERE Config = ?",
        [tahunMand2, "Tahun Imlek 2"],
        (err) => {
          if (err) {
            console.error("Error updating Tahun Imlek 2:", err);
            return res.status(500).json({
              success: false,
              message: "Failed to update Tahun Imlek 2",
            });
          }
        }
      );
    } else {
      db.query(
        "INSERT INTO settings (Config, Value) VALUES (?, ?)",
        ["Tahun Imlek 2", tahunMand2],
        (err) => {
          if (err) {
            console.error("Error inserting Tahun Imlek 2:", err);
            return res.status(500).json({
              success: false,
              message: "Failed to insert Tahun Imlek 2",
            });
          }
        }
      );
    }

    let checkEndDate = (
      await helpers.doQuery(
        db,
        "SELECT * FROM settings WHERE Config = 'End Date'"
      )
    ).results;

    if (checkEndDate.length > 0) {
      db.query(
        "UPDATE settings SET Value = ? WHERE Config = ?",
        [endDate, "End Date"],
        (err) => {
          if (err) {
            console.error("Error updating End Date:", err);
            return res.status(500).json({
              success: false,
              message: "Failed to update End Date",
            });
          }
        }
      );
    } else {
      db.query(
        "INSERT INTO settings (Config, Value) VALUES (?, ?)",
        ["End Date", endDate],
        (err) => {
          if (err) {
            console.error("Error inserting End Date:", err);
            return res.status(500).json({
              success: false,
              message: "Failed to insert End Date",
            });
          }
        }
      );
    }

    return res.status(200).json({
      success: true,
      message: "Settings updated successfully",
    });
  },
};
