const express = require("express");
const helpers = require("../helpers/helpers");
const dotenv = require("dotenv");
const axios = require("axios");
const { db } = require("../configs/db");
let Loyalties = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
const { constants } = require("../configs/constants");

dotenv.config();

module.exports = {
  index: async (req, res) => {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let Username = req.session.Username;
    let akses = await helpers.checkUserAccess(Username, 1, 7);
    if (!akses) return res.redirect("/");
    let menu = await helpers.generateMenu(Username);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, Username);
        return item;
      })
    );
    let getDataTop50Tier = (
      await helpers.doQuery(
        db,
        `SELECT * FROM mst_persentase_hadiah_leaderboard WHERE Category = ? AND WebsiteID = ? ORDER BY Urutan ASC`,
        ["Top Player", process.env.websiteID]
      )
    ).results;
    let dataTop50Tier = {};
    let sisaPersentaseTop50Tier = 100;
    if (getDataTop50Tier.length == 0) {
      sisaPersentaseTop50Tier = 0;
    } else {
      getDataTop50Tier.forEach((el, index) => {
        dataTop50Tier[`rank${el.Urutan}`] = el.Persentase;
        sisaPersentaseTop50Tier -= el.Persentase;
      });
      sisaPersentaseTop50Tier = (sisaPersentaseTop50Tier / 40).toFixed(4);
    }
    let getTotalHadiah = (
      await helpers.doQuery(
        db,
        `SELECT * FROM mst_hadiah_leaderboard WHERE WebsiteID = ? ORDER BY Tier ASC`,
        [process.env.websiteID]
      )
    ).results;
    let dataTotalHadiah = new Array();
    getTotalHadiah.forEach((el) => {
      dataTotalHadiah[el.Tier] = el.TotalHadiah;
    });
    let getDataTop50WD = (
      await helpers.doQuery(
        db,
        `SELECT * FROM mst_persentase_hadiah_leaderboard WHERE Category = ? AND WebsiteID = ? ORDER BY Urutan ASC`,
        ["Withdraw", process.env.websiteID]
      )
    ).results;
    let dataTop50WD = {};
    getDataTop50WD.forEach((el, index) => {
      dataTop50WD[`rank${el.Urutan}`] = el.Persentase;
      if (el.Urutan == 11) {
        dataTop50WD[`otherRank`] = el.Persentase;
      }
    });
    let getDataTopCategory = (
      await helpers.doQuery(
        db,
        `SELECT * FROM mst_game_bonus WHERE (Category = 'Slot' OR Category = 'Casino') AND WebsiteID = ? ORDER BY Category ASC`,
        [process.env.websiteID]
      )
    ).results;
    let dataTopCategory = {};
    getDataTopCategory.forEach((el) => {
      dataTopCategory[el.Category] = el.Percentage;
    });
    let getDataLevelUpBonus = (
      await helpers.doQuery(
        db,
        `SELECT * FROM loyalty_bonus WHERE WebsiteID = ? ORDER BY Tier ASC`,
        [process.env.websiteID]
      )
    ).results;
    let dataLevelUpBonus = {};
    getDataLevelUpBonus.forEach((el) => {
      dataLevelUpBonus[el.Tier] = el.Bonus;
    });
    res.render("prizeLeaderboard/index", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      menu,
      websiteID: process.env.websiteID,
      csrfToken: req.csrfToken(),
      dataTop50Tier,
      sisaPersentaseTop50Tier,
      dataTotalHadiah,
      dataTop50WD,
      dataTopCategory,
      dataLevelUpBonus,
      open: 1,
      active: 7,
      constants,
    });
  },
  saveTop50Tier: async (req, res) => {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let error = {};
    let rank1 = req.body.rank1 ? req.body.rank1 : null;
    let rank2 = req.body.rank2 ? req.body.rank2 : null;
    let rank3 = req.body.rank3 ? req.body.rank3 : null;
    let rank4 = req.body.rank4 ? req.body.rank4 : null;
    let rank5 = req.body.rank5 ? req.body.rank5 : null;
    let rank6 = req.body.rank6 ? req.body.rank6 : null;
    let rank7 = req.body.rank7 ? req.body.rank7 : null;
    let rank8 = req.body.rank8 ? req.body.rank8 : null;
    let rank9 = req.body.rank9 ? req.body.rank9 : null;
    let rank10 = req.body.rank10 ? req.body.rank10 : null;
    let dataRank = [
      rank1,
      rank2,
      rank3,
      rank4,
      rank5,
      rank6,
      rank7,
      rank8,
      rank9,
      rank10,
    ].filter((rank) => rank !== null);
    let total_bronze = req.body.total_bronze ? req.body.total_bronze : null;
    let total_silver = req.body.total_silver ? req.body.total_silver : null;
    let total_gold = req.body.total_gold ? req.body.total_gold : null;
    let total_platinum = req.body.total_platinum
      ? req.body.total_platinum
      : null;
    let total_diamond = req.body.total_diamond ? req.body.total_diamond : null;
    let dataTotal = [
      total_bronze,
      total_silver,
      total_gold,
      total_platinum,
      total_diamond,
    ].filter((dataTotal) => dataTotal !== null);
    if (!rank1) error.rank1 = "Rank 1 is required";
    if (!rank2) error.rank2 = "Rank 2 is required";
    if (!rank3) error.rank3 = "Rank 3 is required";
    if (!rank4) error.rank4 = "Rank 4 is required";
    if (!rank5) error.rank5 = "Rank 5 is required";
    if (!rank6) error.rank6 = "Rank 6 is required";
    if (!rank7) error.rank7 = "Rank 7 is required";
    if (!rank8) error.rank8 = "Rank 8 is required";
    if (!rank9) error.rank9 = "Rank 9 is required";
    if (!rank10) error.rank10 = "Rank 10 is required";
    if (!total_bronze) error.total_bronze = "Total Bronze is required";
    if (!total_silver) error.total_silver = "Total Silver is required";
    if (!total_gold) error.total_gold = "Total Gold is required";
    if (!total_platinum) error.total_platinum = "Total Platinum is required";
    if (!total_diamond) error.total_diamond = "Total Diamond is required";
    // if (Object.keys(error).length > 0) {
    //   return res.json({ error });
    // }
    let promise = new Promise((resolve, reject) => {
      let errors = [];
      let successCount = 0;
      db.query(
        `DELETE FROM mst_persentase_hadiah_leaderboard WHERE Category = 'Top Player' AND WebsiteID = ?`,
        [process.env.websiteID],
        (err) => {
          if (err) {
            console.log(err);
            req.flash("error", "Failed to save data for Top 50 Tier");
            return res.status(400).json({ message: "failed", error: err });
          } else {
            db.query(
              `DELETE FROM mst_hadiah_leaderboard WHERE WebsiteID = ?`,
              [process.env.websiteID],
              (err) => {
                if (err) {
                  console.log(err);
                  req.flash("error", "Failed to save data for Top 50 Tier");
                  return res
                    .status(400)
                    .json({ message: "failed", error: err });
                }
                if (dataRank.length > 0) {
                  dataRank.forEach((el, index, array) => {
                    db.query(
                      `INSERT INTO mst_persentase_hadiah_leaderboard (Category, Urutan, Persentase, WebsiteID, CreatedBy, CreatedDate) VALUE ('Top Player', ?, ?, ?, ?, NOW())`,
                      [index + 1, el, process.env.websiteID, req.session.ID],
                      (err) => {
                        if (err) {
                          console.log(err);
                          errors.push(err);
                        } else {
                          successCount++;
                        }
                        if (index === array.length - 1) {
                          if (errors.length > 0) {
                            reject(errors);
                          } else {
                            resolve();
                          }
                        }
                      }
                    );
                  });
                } else {
                  resolve();
                }
                if (dataTotal.length > 0) {
                  dataTotal.forEach((el, index, array) => {
                    db.query(
                      `INSERT INTO mst_hadiah_leaderboard (Tier, TotalHadiah, WebsiteID, CreatedBy, CreatedDate) VALUE (?, ?, ?, ?, NOW())`,
                      [
                        Loyalties[index],
                        el,
                        process.env.websiteID,
                        req.session.ID,
                      ],
                      (err) => {
                        if (err) {
                          console.log(err);
                          errors.push(err);
                        } else {
                          successCount++;
                        }
                        if (index === array.length - 1) {
                          if (errors.length > 0) {
                            reject(errors);
                          } else {
                            resolve();
                          }
                        }
                      }
                    );
                  });
                } else {
                  resolve();
                }
              }
            );
          }
        }
      );
    });

    promise
      .then((result) => {
        req.flash("success", "Data saved successfully for Top 50 Tier");
        return res.status(200).json({ message: "success" });
      })
      .catch((errors) => {
        console.log(errors);
        req.flash("error", "Failed to save data for Top 50 Tier");
        return res.status(400).json({ message: "failed", errors: errors });
      });
  },
  saveTop50WD: async (req, res) => {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let rank1 = req.body.rank1 ? req.body.rank1 : null;
    let rank2 = req.body.rank2 ? req.body.rank2 : null;
    let rank3 = req.body.rank3 ? req.body.rank3 : null;
    let rank4 = req.body.rank4 ? req.body.rank4 : null;
    let rank5 = req.body.rank5 ? req.body.rank5 : null;
    let rank6 = req.body.rank6 ? req.body.rank6 : null;
    let rank7 = req.body.rank7 ? req.body.rank7 : null;
    let rank8 = req.body.rank8 ? req.body.rank8 : null;
    let rank9 = req.body.rank9 ? req.body.rank9 : null;
    let rank10 = req.body.rank10 ? req.body.rank10 : null;
    let otherRank = req.body.otherRank ? req.body.otherRank : null;
    let dataRank = [
      rank1,
      rank2,
      rank3,
      rank4,
      rank5,
      rank6,
      rank7,
      rank8,
      rank9,
      rank10,
      otherRank,
    ].filter((rank) => rank !== null);
    db.query(
      `DELETE FROM mst_persentase_hadiah_leaderboard WHERE Category = 'Withdraw' AND WebsiteID = ?`,
      [process.env.websiteID],
      (err) => {
        if (err) {
          console.log(err);
          req.flash("error", "Failed to save data for Top 50 Withdraw");
          return res.status(400).json({ message: "failed", error: err });
        }
        let promise = new Promise((resolve, reject) => {
          if (dataRank.length > 0) {
            dataRank.forEach((el, index) => {
              db.query(
                `INSERT INTO mst_persentase_hadiah_leaderboard (Category, Urutan, Persentase, WebsiteID, CreatedBy, CreatedDate) VALUE ('Withdraw', ?, ?, ?, ?, NOW())`,
                [index + 1, el, process.env.websiteID, req.session.ID],
                (err) => {
                  if (err) {
                    console.log(err);
                    reject(err);
                  } else {
                    resolve();
                  }
                }
              );
            });
          } else {
            resolve();
          }
        });
        promise
          .then(() => {
            req.flash("success", "Data saved successfully for Top 50 Withdraw");
            return res.status(200).json({ message: "success" });
          })
          .catch((errors) => {
            console.log(errors);
            req.flash("error", "Failed to save data for Top 50 Withdraw");
            return res.status(400).json({ message: "failed", errors: errors });
          });
      }
    );
  },
  saveTopCategory: async (req, res) => {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let slot = req.body.slot;
    let casino = req.body.casino;
    db.query(
      `DELETE FROM mst_game_bonus WHERE WebsiteID = ?`,
      [process.env.websiteID],
      (err) => {
        if (err) {
          console.log(err);
          req.flash("error", "Failed to save data for top category");
          return res.status(400).json({ message: "failed", error: err });
        }
        db.query(
          `INSERT INTO mst_game_bonus (Category, Percentage, WebsiteID, CDate, Last_Date) VALUE ('Slot', ?, ?, NOW(), NOW())`,
          ["Slot", slot, process.env.websiteID],
          (err) => {
            if (err) {
              console.log(err);
              req.flash("error", "Failed to save data for top category");
              return res.status(400).json({ message: "failed", error: err });
            } else {
              db.query(
                `INSERT INTO mst_game_bonus (Category, Percentage, WebsiteID, CDate, Last_Date) VALUE ('Casino', ?, ?, NOW(), NOW())`,
                ["Casino", casino, process.env.websiteID],
                (err) => {
                  if (err) {
                    console.log(err);
                    req.flash("error", "Failed to save data for top category");
                    return res
                      .status(400)
                      .json({ message: "failed", error: err });
                  } else {
                    req.flash(
                      "success",
                      "Data saved successfully for top category"
                    );
                    return res.status(200).json({ message: "success" });
                  }
                }
              );
            }
          }
        );
      }
    );
  },
  saveLevelUpBonus: async (req, res) => {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let Bronze = req.body.levelup_bronze ? req.body.levelup_bronze : null;
    let Silver = req.body.levelup_silver ? req.body.levelup_silver : null;
    let Gold = req.body.levelup_gold ? req.body.levelup_gold : null;
    let Platinum = req.body.levelup_platinum ? req.body.levelup_platinum : null;
    let Diamond = req.body.levelup_diamond ? req.body.levelup_diamond : null;
    let data = [Bronze, Silver, Gold, Platinum, Diamond].filter(
      (rank) => rank !== null
    );
    let promise = new Promise((resolve, reject) => {
      let errors = [];
      let successCount = 0;
      db.query(
        `DELETE FROM loyalty_bonus WHERE WebsiteID = ?`,
        [process.env.websiteID],
        (err) => {
          if (err) {
            console.log(err);
            req.flash("error", "Failed to save data for Level Up Bonus");
            return res.status(400).json({ message: "failed", error: err });
          }
          if (data.length > 0) {
            data.forEach((el, index, array) => {
              db.query(
                `INSERT INTO loyalty_bonus (Tier, Bonus, WebsiteID, CDate, Last_Date) VALUE (?, ?, ?, NOW(), NOW())`,
                [Loyalties[index], el, process.env.websiteID],
                (err) => {
                  if (err) {
                    console.log(err);
                    errors.push(err);
                  } else {
                    successCount++;
                  }
                  if (index === array.length - 1) {
                    if (errors.length > 0) {
                      reject(errors);
                    } else {
                      resolve();
                    }
                  }
                }
              );
            });
          } else {
            resolve();
          }
        }
      );
    });
    promise
      .then((result) => {
        req.flash("success", "Data saved successfully for Level Up Bonus");
        return res.status(200).json({ message: "success" });
      })
      .catch((errors) => {
        req.flash("error", "Failed to save data for Level Up Bonus");
        return res.status(400).json({ message: "failed", errors: errors });
      });
  },
};
