import type from "prop-types";
import React from "react";
import orderBy from "lodash/orderBy";
import Slider from "./Slider";
import AutoComplete from "material-ui/AutoComplete";
import IconButton from "material-ui/IconButton";
import RaisedButton from "material-ui/RaisedButton";
import Snackbar from "material-ui/Snackbar";
import GSForm from "../components/forms/GSForm";
import yup from "yup";
import Form from "react-formal";
import CampaignFormSectionHeading from "./CampaignFormSectionHeading";
import { StyleSheet, css } from "aphrodite";
import theme from "../styles/theme";
import Toggle from "material-ui/Toggle";
import DeleteIcon from "material-ui/svg-icons/action/delete";
import { dataTest } from "../lib/attributes";
import { dataSourceItem } from "./utils";
import { getHighestRole } from "../lib/permissions";

const styles = StyleSheet.create({
  sliderContainer: {
    border: `1px solid ${theme.colors.lightGray}`,
    padding: 10,
    borderRadius: 8
  },
  removeButton: {
    width: 50
  },
  texterRow: {
    display: "flex",
    flexDirection: "row"
  },
  alreadyTextedHeader: {
    textAlign: "right",
    fontWeight: 600,
    fontSize: 16
  },
  availableHeader: {
    fontWeight: 600,
    fontSize: 16
  },
  nameColumn: {
    width: 100,
    textOverflow: "ellipsis",
    marginTop: "auto",
    marginBottom: "auto",
    paddingRight: 10
  },
  splitToggle: {
    ...theme.text.body,
    flex: "1 1 50%"
  },
  slider: {
    flex: "1 1 35%",
    marginTop: "auto",
    marginBottom: "auto",
    paddingRight: 10
  },
  leftSlider: {
    flex: "1 1 35%",
    marginTop: "auto",
    marginBottom: "auto",
    paddingRight: 10
  },
  headerContainer: {
    display: "flex",
    borderBottom: `1px solid ${theme.colors.lightGray}`,
    marginBottom: 20
  },
  assignedCount: {
    width: 40,
    fontSize: 16,
    paddingLeft: 5,
    paddingRight: 5,
    textAlign: "center",
    marginTop: "auto",
    marginBottom: "auto",
    marginRight: 10,
    display: "inline-block",
    backgroundColor: theme.colors.lightGray
  },
  input: {
    width: 50,
    paddingLeft: 0,
    paddingRight: 0,
    marginRight: 10,
    marginTop: "auto",
    marginBottom: "auto",
    display: "inline-block"
  }
});

const inlineStyles = {
  autocomplete: {
    marginBottom: 24
  },
  radioButtonGroup: {
    marginBottom: 12
  },
  header: {
    ...theme.text.header
  }
};

export default class CampaignTextersForm extends React.Component {
  state = {
    autoSplit: false,
    focusedTexterId: null,
    snackbarOpen: false,
    snackbarMessage: ""
  };

  onChange = formValues => {
    const existingFormValues = this.formValues();
    const changedTexterId = this.state.focusedTexterId;
    const newFormValues = {
      ...formValues
    };
    let totalNeedsMessage = 0;
    let totalMessaged = 0;
    const texterCountChanged =
      newFormValues.assignments.length !==
      existingFormValues.assignments.length;

    // 1. map form texters to existing texters. with needsMessageCount tweaked to minimums when invalid or useless
    newFormValues.assignments = newFormValues.assignments.map(newAssignment => {
      const existingAssignment = existingFormValues.assignments.filter(
        assignment =>
          assignment.texter.id === newAssignment.texter.id ? assignment : null
      )[0];
      let messagedCount = 0;
      if (existingAssignment) {
        messagedCount =
          existingAssignment.contactsCount -
          existingAssignment.needsMessageCount;
        totalMessaged += messagedCount;
      }

      let convertedNeedsMessageCount = parseInt(
        newAssignment.needsMessageCount,
        10
      );
      let convertedMaxContacts = !!newAssignment.maxContacts
        ? parseInt(newAssignment.maxContacts)
        : null;

      if (isNaN(convertedNeedsMessageCount)) {
        convertedNeedsMessageCount = 0;
      }
      if (
        convertedNeedsMessageCount + messagedCount >
        this.formValues().contactsCount
      ) {
        convertedNeedsMessageCount =
          this.formValues().contactsCount - messagedCount;
      }

      if (convertedNeedsMessageCount < 0) {
        convertedNeedsMessageCount = 0;
      }

      if (texterCountChanged && this.state.autoSplit) {
        convertedNeedsMessageCount = 0;
      }

      totalNeedsMessage = totalNeedsMessage + convertedNeedsMessageCount;

      return {
        ...newAssignment,
        contactsCount: convertedNeedsMessageCount + messagedCount,
        messagedCount,
        needsMessageCount: convertedNeedsMessageCount,
        maxContacts: convertedMaxContacts
      };
    });

    // extraTexterCapacity is the number of contacts assigned to texters in excess of the
    // total number of contacts available
    let extraTexterCapacity =
      totalNeedsMessage + totalMessaged - this.formValues().contactsCount;

    if (extraTexterCapacity > 0) {
      // 2. If extraTexterCapacity > 0, reduce the user's input to the number of contacts available
      // for assignment
      newFormValues.assignments = newFormValues.assignments.map(
        newAssignment => {
          if (newAssignment.id === changedTexterId) {
            const assignmentToReturn = newAssignment;
            assignmentToReturn.needsMessageCount -= extraTexterCapacity;
            assignmentToReturn.contactsCount -= extraTexterCapacity;
            return assignmentToReturn;
          }
          return assignmentToReturn;
        }
      );
      const focusedTexter = newFormValues.assignments.find(assignment => {
        return assignment.texter.id === changedTexterId;
      });
      this.setState({
        snackbarOpen: true,
        snackbarMessage: `${focusedTexter.contactsCount} contact${
          focusedTexter.contactsCount === 1 ? "" : "s"
        } assigned to ${this.getDisplayName(focusedTexter.id)}`
      });
    } else if (this.state.autoSplit) {
      // 3. if we don't have extraTexterCapacity and auto-split is on, then fill the texters with assignments
      const factor = 1;
      let index = 0;
      let skipsByIndex = new Array(newFormValues.assignments.length).fill(0);
      if (newFormValues.assignments.length === 1) {
        const messagedCount =
          newFormValues.assignments[0].contactsCount -
          newFormValues.assignments[0].needsMessageCount;
        newFormValues.assignments[0].contactsCount = this.formValues().contactsCount;
        newFormValues.assignments[0].needsMessageCount =
          this.formValues().contactsCount - messagedCount;
      } else if (newFormValues.assignments.length > 1) {
        while (extraTexterCapacity < 0) {
          const assignment = newFormValues.assignments[index];
          if (
            skipsByIndex[index] <
            assignment.contactsCount - assignment.needsMessageCount
          ) {
            skipsByIndex[index]++;
          } else {
            if (!changedTexterId || assignment.texter.id !== changedTexterId) {
              if (assignment.needsMessageCount + factor >= 0) {
                assignment.needsMessageCount =
                  assignment.needsMessageCount + factor;
                assignment.contactsCount = assignment.contactsCount + factor;
                extraTexterCapacity = extraTexterCapacity + factor;
              }
            }
          }
          index = index + 1;
          if (index >= newFormValues.assignments.length) {
            index = 0;
          }
        }
      }
    }
    this.props.onChange(newFormValues);
  };

  formSchema = yup.object({
    assignments: yup.array().of(
      yup.object({
        needsMessageCount: yup.string(),
        maxContacts: yup.string().nullable(),
        texter: yup.object({
          id: yup.string(),
          firstName: yup.string(),
          lastName: yup.string()
        })
      })
    )
  });

  formValues() {
    const unorderedTexters = this.props.formValues.texters;
    return {
      ...this.props.formValues,
      texters: orderBy(
        unorderedTexters,
        ["firstName", "lastName"],
        ["asc", "asc"]
      )
    };
  }

  showSearch() {
    const { orgTexters } = this.props;
    const { assignments } = this.formValues();

    const dataSource = orgTexters
      .filter(
        orgTexter =>
          !assignments.find(assignment => assignment.texter.id === orgTexter.id)
      )
      .filter(orgTexter => getHighestRole(orgTexter.roles) !== "SUSPENDED")
      .map(orgTexter => dataSourceItem(orgTexter.displayName, orgTexter.id));

    const filter = (searchText, key) =>
      key === "allTexters" ? true : AutoComplete.fuzzyFilter(searchText, key);

    const autocomplete = (
      <AutoComplete
        ref="autocomplete"
        style={inlineStyles.autocomplete}
        autoFocus
        onFocus={() => this.setState({ searchText: "" })}
        onUpdateInput={searchText => this.setState({ searchText })}
        searchText={this.state.searchText}
        filter={filter}
        hintText="Search for texters to assign"
        dataSource={dataSource}
        {...dataTest("texterSearch")}
        onNewRequest={value => {
          // If you're searching but get no match, value is a string
          // representing your search term, but we only want to handle matches
          if (typeof value === "object") {
            const texterId = value.value.key;
            const newTexter = this.props.orgTexters.find(
              texter => texter.id === texterId
            );
            this.onChange({
              assignments: [
                ...this.formValues().assignments,
                {
                  texter: {
                    id: newTexter.Id,
                    firstName: newTexter.firstName
                  },
                  contactsCount: 0,
                  needsMessageCount: 0
                }
              ]
            });
          }
        }}
      />
    );

    return <div>{orgTexters.length > 0 ? autocomplete : ""}</div>;
  }

  addAllTexters() {
    const { orgTexters } = this.props;

    const assigmnentsToAdd = orgTexters.map(orgTexter => {
      const id = orgTexter.id;
      const firstName = orgTexter.firstName;
      return {
        contactsCount: 0,
        needsMessageCount: 0,
        texter: {
          id,
          firstName
        }
      };
    });

    this.onChange({ assigmnents: assigmnentsToAdd });
  }

  getDisplayName(texterId) {
    const texterObj = this.props.orgTexters.find(o => o.id === texterId);
    const suffix =
      getHighestRole(texterObj.roles) === "SUSPENDED" ? " (Suspended)" : "";
    return texterObj.displayName + suffix;
  }

  showTexters() {
    return this.formValues().assignments.map((assignment, index) => {
      const messagedCount =
        assignment.contactsCount - assignment.needsMessageCount;
      return (
        <div
          {...dataTest("texterRow")}
          key={assignment.texter.id}
          className={css(styles.texterRow)}
        >
          <div className={css(styles.leftSlider)}>
            <Slider
              maxValue={this.formValues().contactsCount}
              value={messagedCount}
              color={theme.colors.darkGray}
              direction={1}
            />
          </div>
          <div className={css(styles.assignedCount)}>{messagedCount}</div>
          <div {...dataTest("texterName")} className={css(styles.nameColumn)}>
            {this.getDisplayName(assignment.texter.id)}
          </div>
          <div className={css(styles.input)}>
            <Form.Field
              {...dataTest("texterAssignment")}
              name={`assignments[${index}].needsMessageCount`}
              mapToValue={m =>
                m.assignments.find(t => t.texter.id === assignment.texter.id)
                  .needsMessageCount
              }
              hintText="Contacts"
              fullWidth
              onFocus={() =>
                this.setState({ focusedTexterId: assignment.texter.id })
              }
              onBlur={() =>
                this.setState({
                  focusedTexterId: null
                })
              }
            />
          </div>
          <div className={css(styles.slider)}>
            <Slider
              maxValue={this.formValues().contactsCount}
              value={assignment.needsMessageCount}
              color={theme.colors.green}
              direction={0}
            />
          </div>
          {this.props.useDynamicAssignment ? (
            <div className={css(styles.input)}>
              <Form.Field
                name={`assignments[${index}].maxContacts`}
                hintText="Max"
                fullWidth
                onFocus={() => this.setState({ focusedTexterId: texter.id })}
                onBlur={() =>
                  this.setState({
                    focusedTexterId: null
                  })
                }
              />
            </div>
          ) : (
            ""
          )}
          <div className={css(styles.removeButton)}>
            <IconButton
              onTouchTap={async () => {
                const currentFormValues = this.formValues();
                const newFormValues = {
                  ...currentFormValues
                };
                newFormValues.assignments = newFormValues.assignments.slice();
                if (messagedCount === 0) {
                  newFormValues.assignments.splice(index, 1);
                } else {
                  await this.setState({
                    focusedTexterId: assignment.texter.id
                  });
                  newFormValues.assignment[index] = {
                    ...assigment,
                    needsMessageCount: 0,
                    texter: {
                      id: assignment.texter.id
                    }
                  };
                }
                this.onChange(newFormValues);
              }}
            >
              <DeleteIcon />
            </IconButton>
          </div>
        </div>
      );
    });
  }

  handleSnackbarClose = () => {
    this.setState({ snackbarOpen: false, snackbarMessage: "" });
  };

  render() {
    const { organizationUuid, campaignId } = this.props;
    const assignedContacts = this.formValues().assignments.reduce(
      (prev, assignment) => prev + assignment.contactsCount,
      0
    );

    const headerColor =
      assignedContacts === this.formValues().contactsCount
        ? theme.colors.green
        : theme.colors.orange;
    return (
      <div>
        <CampaignFormSectionHeading
          title="Who should send the texts?"
          subtitle={"Also see Dynamic Assignment Panel, below."}
        />
        <GSForm
          schema={this.formSchema}
          value={this.formValues()}
          onChange={this.onChange}
          onSubmit={this.props.onSubmit}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {this.showSearch()}
            <div>
              <RaisedButton
                {...dataTest("addAll")}
                label="Add All"
                onTouchTap={() => this.addAllTexters()}
              />
            </div>
          </div>
          <div className={css(styles.sliderContainer)}>
            <div className={css(styles.headerContainer)}>
              <div
                style={{
                  ...inlineStyles.header,
                  color: headerColor,
                  flex: "1 1 50%"
                }}
              >
                {`Assigned contacts: ${assignedContacts}/${
                  this.formValues().contactsCount
                }`}
              </div>
              <div className={css(styles.splitToggle)}>
                <Toggle
                  {...dataTest("autoSplit")}
                  label="Split assignments"
                  style={{
                    width: "auto",
                    marginLeft: "auto"
                  }}
                  toggled={this.state.autoSplit}
                  onToggle={() => {
                    this.setState({ autoSplit: !this.state.autoSplit }, () => {
                      if (this.state.autoSplit) {
                        const contactsCount = Math.floor(
                          this.formValues().contactsCount /
                            this.formValues().assignments.length
                        );
                        const newAssignments = this.formValues().assignments.map(
                          assignment => ({
                            ...assignment,
                            texter: {
                              ...assignment.texter,
                              contactsCount
                            }
                          })
                        );
                        this.onChange({
                          ...this.formValues(),
                          assignments: newAssignments
                        });
                      }
                    });
                  }}
                />
              </div>
            </div>
            <div className={css(styles.texterRow)}>
              <div
                className={css(styles.leftSlider, styles.alreadyTextedHeader)}
              >
                Already texted
              </div>
              <div className={css(styles.assignedCount)}></div>
              <div className={css(styles.nameColumn)}></div>
              <div className={css(styles.input)}></div>
              <div className={css(styles.slider, styles.availableHeader)}>
                Available to assign
              </div>
              <div className={css(styles.removeButton)}></div>
            </div>
            {this.showTexters()}
          </div>
          <Form.Button
            type="submit"
            label={this.props.saveLabel}
            disabled={this.props.saveDisabled}
            {...dataTest("submitCampaignTextersForm")}
          />
        </GSForm>
        <Snackbar
          open={this.state.snackbarOpen}
          message={this.state.snackbarMessage}
          autoHideDuration={3000}
          onRequestClose={this.handleSnackbarClose}
        />
      </div>
    );
  }
}

CampaignTextersForm.propTypes = {
  onChange: type.func,
  orgTexters: type.array,
  ensureComplete: type.bool,
  organizationId: type.string,
  formValues: type.object,
  contactsCount: type.number,
  useDynamicAssignment: type.bool,
  onSubmit: type.func,
  saveLabel: type.string,
  saveDisabled: type.bool
};
