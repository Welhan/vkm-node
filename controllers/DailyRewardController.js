const express = require("express");
const helpers = require("../helpers/helpers");
const dotenv = require("dotenv");
const { db } = require("../configs/db");
const { constants } = require("../configs/constants");

dotenv.config();
const formatDateTime = (date) => {
  const d = new Date(date);
  const pad = (num) => (num < 10 ? `0${num}` : num);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
module.exports = {
  index: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let akses = await helpers.checkUserAccess(Username, 4, 4);
    if (!akses) return res.redirect("/");
    let menu = await helpers.generateMenu(Username);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, Username);
        return item;
      })
    );
    return res.render("daily_reward/daily_reward", {
      session: req.session,
      menu,
      csrfToken: req.csrfToken(),
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      open: 4,
      active: 4,
      constants,
    });
  },
  getDataPeriodeDailyReward: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let StartDate = req.body.StartDate;
    let EndDate = req.body.EndDate;
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT A.*, B.PeriodeID FROM daily_reward_periode A 
        LEFT JOIN daily_reward_detail B ON A.ID = B.PeriodeID 
        WHERE A.WebsiteID = ? 
        GROUP BY A.ID ORDER BY A.ID DESC;`,
        [process.env.websiteID]
      )
    ).results;
    getData.forEach((el) => {
      const currentDate = new Date();
      const startDate = new Date(el.StartDate);
      const endDate = new Date(el.EndDate);
      el.StartDate = formatDateTime(el.StartDate);
      el.EndDate = formatDateTime(el.EndDate);
      el.Status =
        currentDate < startDate
          ? "Coming Soon"
          : currentDate >= startDate && currentDate <= endDate
          ? "Running"
          : "Expired";
    });
    res.render(
      "daily_reward/dataTable/daily_reward",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        data: getData,
      },
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
  getAddPeriodeDailyReward: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    res.render(
      "daily_reward/modals/addPeriodeDailyReward",
      {
        layout: false,
        csrfToken: req.csrfToken(),
      },
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
  addPeriodeDailyReward: async function (req, res) {
    const { Username, ID } = req.session;
    const { StartDateForm: StartDate } = req.body;

    if (!Username) {
      return res.redirect("/login");
    }

    const errors = {};
    if (!StartDate) {
      errors.StartDate = "StartDate wajib dipilih";
      return res.json({ error: errors });
    }

    const EndDate = new Date(StartDate);
    EndDate.setDate(EndDate.getDate() + 6);
    const formattedStartDate = `${StartDate} 00:00:00`;
    const formattedEndDate = `${EndDate.toISOString().slice(0, 10)} 23:59:59`;

    const query = `INSERT INTO daily_reward_periode (StartDate, EndDate, WebsiteID, CreatedBy, CreatedDate) VALUES (?, ?, ?, ?, NOW())`;
    const values = [
      formattedStartDate,
      formattedEndDate,
      process.env.websiteID,
      ID,
    ];

    try {
      db.query(query, values);
      req.flash("success", "Daily Reward Periode berhasil disimpan");
      return res.status(200).json({ status: true });
    } catch (err) {
      console.error(err);
      req.flash("failed", "Gagal menyimpan Daily Reward Periode");
      return res.status(500).json({ status: false });
    }
  },

  getUpdatePeriodeDailyReward: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let PeriodeID = req.body.PeriodeID;
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT * FROM daily_reward_periode WHERE ID = ?`,
        [PeriodeID]
      )
    ).results;
    getData.forEach((el) => {
      el.StartDate = formatDateTime(el.StartDate);
      el.EndDate = formatDateTime(el.EndDate);
    });
    res.render(
      "daily_reward/modals/updatePeriodeDailyReward",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        data: getData[0],
      },
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
  updatePeriodeDailyReward: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let PeriodeID = req.body.PeriodeID;
    let StartDate = req.body.StartDateForm;

    const errors = {};
    if (!StartDate) {
      errors.StartDate = "StartDate wajib dipilih";
      return res.json({ error: errors });
    }

    const EndDate = new Date(StartDate);
    EndDate.setDate(EndDate.getDate() + 6);
    const formattedStartDate = `${StartDate} 00:00:00`;
    const formattedEndDate = `${EndDate.toISOString().slice(0, 10)} 23:59:59`;
    let getDataDetail = (
      await helpers.doQuery(
        db,
        `SELECT * FROM daily_reward_detail WHERE PeriodeID = ? ORDER BY DayReward ASC`,
        [PeriodeID]
      )
    ).results;
    if (getDataDetail.length > 0) {
      db.query(
        `UPDATE daily_reward_periode SET StartDate = ?, EndDate = ? WHERE ID = ?`,
        [formattedStartDate, formattedEndDate, PeriodeID],
        function (err) {
          if (err) {
            console.log(err);
            req.flash("failed", "Gagal update tanggal periode Daily Reward");
            return res.status(202).json({ status: false });
          }
          db.query(
            `DELETE FROM daily_reward_detail WHERE PeriodeID = ?`,
            [PeriodeID],
            function (err) {
              if (err) {
                console.log(err);
                req.flash(
                  "failed",
                  "Gagal update tanggal periode Daily Reward"
                );
                return res.status(202).json({ status: false });
              }
              let promise = new Promise((resolve, reject) => {
                getDataDetail.forEach((el, index) => {
                  const DateReward = new Date(StartDate);
                  DateReward.setDate(DateReward.getDate() + index);
                  const formattedDateReward =
                    DateReward.toISOString().slice(0, 10) + " 00:00:00";
                  db.query(
                    `INSERT INTO daily_reward_detail (PeriodeID, DayReward, Reward, WebsiteID, CreatedBy, CreatedDate) VALUES (?, ?, ?, ?, ?, NOW())`,
                    [
                      PeriodeID,
                      formattedDateReward,
                      el.Reward,
                      process.env.websiteID,
                      req.session.ID,
                    ],
                    (err, result) => {
                      if (err) {
                        console.log(err);
                        reject(err);
                      } else {
                        resolve(result);
                      }
                    }
                  );
                });
              });
              promise
                .then((result) => {
                  req.flash(
                    "failed",
                    "Berhasil update tanggal periode Daily Reward"
                  );
                  return res.status(200).json({ message: "success" });
                })
                .catch((errors) => {
                  req.flash(
                    "failed",
                    "Gagal update tanggal periode Daily Reward"
                  );
                  return res
                    .status(400)
                    .json({ message: "failed", errors: errors });
                });
            }
          );
        }
      );
    } else {
      db.query(
        `UPDATE daily_reward_periode SET StartDate = ?, EndDate = ? WHERE ID = ?`,
        [formattedStartDate, formattedEndDate, PeriodeID],
        function (err) {
          if (err) {
            console.log(err);
            req.flash("failed", "Gagal update tanggal periode Daily Reward");
            return res.status(202).json({ status: false });
          }
          req.flash("failed", "Berhasil update tanggal periode Daily Reward");
          return res.status(200).json({ status: true });
        }
      );
    }
  },
  getDeletePeriodeDailyReward: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let PeriodeID = req.body.PeriodeID;
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT * FROM daily_reward_periode WHERE ID = ?`,
        [PeriodeID]
      )
    ).results;
    getData.forEach((el) => {
      el.StartDate = formatDateTime(el.StartDate);
      el.EndDate = formatDateTime(el.EndDate);
    });
    res.render(
      "daily_reward/modals/deletePeriodeDailyReward",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        data: getData[0],
      },
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
  deletePeriodeDailyReward: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let PeriodeID = req.body.PeriodeID;
    db.query(
      `DELETE FROM daily_reward_periode WHERE ID = ?`,
      [PeriodeID],
      function (err) {
        if (err) {
          console.log(err);
          req.flash("failed", "Gagal hapus periode Daily Reward");
          return res.status(202).json({ status: false });
        }
        db.query(
          `DELETE FROM daily_reward_detail WHERE PeriodeID = ?`,
          [PeriodeID],
          function (err) {
            if (err) {
              console.log(err);
              req.flash("failed", "Gagal hapus periode Daily Reward");
              return res.status(202).json({ status: false });
            }
            req.flash("failed", "Berhasil hapus periode Daily Reward");
            return res.status(200).json({ status: true });
          }
        );
      }
    );
  },

  getSetRewardDailyReward: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let PeriodeID = req.body.PeriodeID;
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT * FROM daily_reward_periode WHERE ID = ?`,
        [PeriodeID]
      )
    ).results;
    getData.forEach((el) => {
      el.StartDate = formatDateTime(el.StartDate);
      el.EndDate = formatDateTime(el.EndDate);
    });
    res.render(
      "daily_reward/modals/setRewardDailyReward",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        data: getData[0],
      },
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
  setRewardDailyReward: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let { Day1, Day2, Day3, Day4, Day5, Day6, Day7, PeriodeID } = req.body;
    let Days = [Day1, Day2, Day3, Day4, Day5, Day6, Day7];
    let error = {};
    Days.forEach((el, index) => {
      if (!el) {
        let dayKey = `Day${index + 1}`;
        error[dayKey] = `Prize Reward Day ${index + 1} wajib diisi`;
      }
    });

    if (Object.keys(error).length > 0) {
      return res.json({ error });
    }
    let promise = new Promise((resolve, reject) => {
      db.query(
        `DELETE FROM daily_reward_detail WHERE PeriodeID = ?`,
        [PeriodeID],
        function (err) {
          if (err) {
            console.log(err);
            reject(err);
          }
          Days.forEach((el, index) => {
            db.query(
              `INSERT INTO daily_reward_detail (PeriodeID, DayReward, Reward, WebsiteID, CreatedBy, CreatedDate) VALUES (?, ?, ?, ?, ?, NOW())`,
              [PeriodeID, index + 1, el, process.env.websiteID, req.session.ID],
              (err, result) => {
                if (err) {
                  console.log(err);
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
          });
        }
      );
    });
    promise
      .then((result) => {
        req.flash("success", "Reward berhasil disimpan");
        return res.status(200).json({ message: "success" });
      })
      .catch((errors) => {
        req.flash("error", "Reward gagal disimpan");
        return res.status(400).json({ message: "failed", errors: errors });
      });
  },
  getUpdateRewardDailyReward: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let PeriodeID = req.body.PeriodeID;
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT A.StartDate, A.EndDate, A.ID AS PeriodeID, Reward FROM daily_reward_periode A
    LEFT JOIN daily_reward_detail B ON A.ID = B.PeriodeID WHERE A.ID = ? ORDER BY B.DayReward ASC`,
        [PeriodeID]
      )
    ).results;
    getData.forEach((el) => {
      el.StartDate = formatDateTime(el.StartDate);
      el.EndDate = formatDateTime(el.EndDate);
    });
    res.render(
      "daily_reward/modals/updateRewardDailyReward",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        data: getData,
      },
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
  updateRewardDailyReward: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let { Day1, Day2, Day3, Day4, Day5, Day6, Day7, PeriodeID } = req.body;
    let Days = [Day1, Day2, Day3, Day4, Day5, Day6, Day7];
    let error = {};
    Days.forEach((el, index) => {
      if (!el) {
        let dayKey = `Day${index + 1}`;
        error[dayKey] = `Prize Reward Day ${index + 1} wajib diisi`;
      }
    });
    if (Object.keys(error).length > 0) {
      return res.json({ error });
    }
    let promise = new Promise((resolve, reject) => {
      db.query(
        `DELETE FROM daily_reward_detail WHERE PeriodeID = ?`,
        [PeriodeID],
        function (err) {
          if (err) {
            console.log(err);
            reject(err);
          }
          Days.forEach((el, index) => {
            db.query(
              `INSERT INTO daily_reward_detail (PeriodeID, DayReward, Reward, WebsiteID, CreatedBy, CreatedDate) VALUES (?, ?, ?, ?, ?, NOW())`,
              [PeriodeID, index + 1, el, process.env.websiteID, req.session.ID],
              (err, result) => {
                if (err) {
                  console.log(err);
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
          });
        }
      );
    });
    promise
      .then((result) => {
        req.flash("success", "Reward berhasil disimpan");
        return res.status(200).json({ message: "success" });
      })
      .catch((errors) => {
        req.flash("error", "Reward gagal disimpan");
        return res.status(400).json({ message: "failed", errors: errors });
      });
  },
};
