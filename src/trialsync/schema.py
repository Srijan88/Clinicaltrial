"""Pydantic models for TrialSync.

These models define the normalized shapes that every later milestone (the Band
agent layer, the knowledge agent, the audit trail) will consume. Keep them
strict and deterministic — no LLM, no network logic lives here.

Normalized "lever" keys are the controlled vocabulary used to connect a trial's
structured eligibility criteria to a patient's structured profile. A criterion
references exactly one lever; the matcher reads the same lever off the patient.
"""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Controlled vocabularies
# ---------------------------------------------------------------------------

# Normalized lever keys. A Criterion targets one of these; the Patient profile
# exposes the same keys (directly or via derived properties) so the baseline
# matcher can compare them deterministically.
Lever = Literal[
    "hr_status",
    "er_status",
    "pr_status",
    "her2_status",
    "ar_status",
    "subtype",
    "ecog",
    "on_cdk46_inhibitor",
    "durable_disease_control",
    "washout_days_systemic",
    "brain_mets_status",
    "anc",
    "hgb",
    "platelets",
    # Free-form clinical gate with no structured patient field (e.g. "measurable
    # metastatic disease"). The matcher treats these as informational unless a
    # patient value is supplied.
    "measurable_disease",
    "metastatic_disease",
]

# HER2 is deliberately richer than a boolean: modern eligibility distinguishes
# positive / low / zero, plus a generic "negative" alias used by some protocols.
Her2Status = Literal["positive", "low", "zero", "negative"]

CriterionType = Literal["inclusion", "exclusion"]

# Operators the deterministic matcher understands.
Operator = Literal["==", "!=", "in", "not_in", ">=", "<=", ">", "<"]


# ---------------------------------------------------------------------------
# Core models
# ---------------------------------------------------------------------------

class Criterion(BaseModel):
    """One structured, paraphrased eligibility lever.

    Verbatim protocol text is NOT stored here — it lives in Trial.rawCriteria.
    `text` is a short human paraphrase; `lever`/`operator`/`value` are what the
    deterministic matcher actually evaluates.
    """

    id: str
    text: str
    type: CriterionType
    lever: Lever
    operator: Operator
    # value can be a scalar (str/int/bool/float) or a list for in/not_in.
    value: Union[str, int, float, bool, list]


class Trial(BaseModel):
    nctId: str
    title: str
    phase: Optional[str] = None
    status: str
    conditions: list[str] = Field(default_factory=list)
    criteria: list[Criterion] = Field(default_factory=list)
    rawCriteria: str = ""
    detailsUrl: str = ""


class PriorTherapy(BaseModel):
    drug: str
    line: int
    endDate: Optional[str] = None  # ISO date string, or None if ongoing


class Labs(BaseModel):
    anc: float      # absolute neutrophil count (x10^9/L)
    hgb: float      # hemoglobin (g/dL)
    platelets: float  # platelets (x10^9/L)


class Patient(BaseModel):
    patientId: str
    age: int
    sex: str
    diagnosis: str
    stage: str
    er_status: str        # positive | negative
    pr_status: str        # positive | negative
    her2_status: Her2Status
    ar_status: str        # positive | negative | unknown
    ecog: int
    labs: Labs
    priorTherapies: list[PriorTherapy] = Field(default_factory=list)
    on_cdk46_inhibitor: bool = False
    durable_disease_control: bool = False
    brainMets: bool = False
    location: str = ""

    # --- Derived levers -----------------------------------------------------
    # hr_status and subtype are DERIVED from ER/PR/HER2 so synthetic patient
    # files never disagree with themselves. The matcher reads these like any
    # other lever.

    @property
    def hr_status(self) -> str:
        """HR+ if either ER or PR is positive, else negative."""
        if self.er_status == "positive" or self.pr_status == "positive":
            return "positive"
        return "negative"

    @property
    def subtype(self) -> str:
        """Coarse intrinsic subtype derived from receptor status."""
        her2_pos = self.her2_status in ("positive",)
        hr_pos = self.hr_status == "positive"
        if her2_pos and hr_pos:
            return "HR+/HER2+"
        if her2_pos and not hr_pos:
            return "HER2+"
        if hr_pos:
            return "HR+/HER2-"
        # ER- PR- and HER2 not positive => triple negative
        return "TNBC"

    @property
    def brain_mets_status(self) -> str:
        return "present" if self.brainMets else "absent"

    @property
    def anc(self) -> float:
        return self.labs.anc

    @property
    def hgb(self) -> float:
        return self.labs.hgb

    @property
    def platelets(self) -> float:
        return self.labs.platelets

    def lever_value(self, lever: str):
        """Return the patient's value for a normalized lever, or None if the
        patient does not carry meaningful information for it. The matcher
        treats a None value as a definite failure for any criterion that
        depends on the lever.
        """
        # Direct attributes / derived properties.
        if lever in (
            "hr_status", "er_status", "pr_status", "her2_status", "ar_status",
            "subtype", "ecog", "on_cdk46_inhibitor", "durable_disease_control",
            "brain_mets_status", "anc", "hgb", "platelets",
        ):
            val = getattr(self, lever)
            # ar_status / her2_status may legitimately be "unknown".
            if val == "unknown":
                return None
            return val

        if lever == "washout_days_systemic":
            return self._washout_days_systemic()

        # measurable_disease / metastatic_disease: inferred from stage. Stage IV
        # metastatic patients are assumed to have metastatic disease present.
        if lever in ("measurable_disease", "metastatic_disease"):
            return "present" if self.stage.upper().startswith("IV") else None

        return None

    def _washout_days_systemic(self) -> Optional[int]:
        """Days since the most recent prior systemic therapy ended.

        Computed deterministically against a FIXED reference date so the demo
        never depends on the wall clock. The reference date matches currentDate
        used when authoring the synthetic patients.
        """
        from datetime import date

        REFERENCE_DATE = date(2026, 6, 13)
        ended = [
            pt.endDate for pt in self.priorTherapies if pt.endDate is not None
        ]
        if not ended:
            return None
        latest = max(date.fromisoformat(d) for d in ended)
        return (REFERENCE_DATE - latest).days


class Clinician(BaseModel):
    clinicianId: str
    name: str
    site: str
    role: str
