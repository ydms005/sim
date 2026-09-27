import { cx } from "../common";
import { INPUT } from "../../pages/univ/community/parts";
import type { MemberProfileInput, TeacherRole, UserType } from "../../auth/store";

/** 학생/학부모/교사 카드 선택 + 그에 맞는 입력 항목. 가입 동의 창과 내 정보 화면에서 함께 씁니다. */

export interface MemberFieldsValue {
  userType: UserType | "";
  realName: string;
  school: string;
  grade: string;
  classNo: string;
  studentNo: string;
  teacherRole: TeacherRole | "";
  teacherGrade: string;
  teacherClass: string;
}

export const EMPTY_MEMBER_FIELDS: MemberFieldsValue = {
  userType: "",
  realName: "",
  school: "",
  grade: "",
  classNo: "",
  studentNo: "",
  teacherRole: "",
  teacherGrade: "",
  teacherClass: "",
};

export function memberFieldsFromProfile(p: {
  user_type: UserType | null;
  real_name: string | null;
  school: string | null;
  grade: number | null;
  class_no: number | null;
  student_no: number | null;
  teacher_role: TeacherRole | null;
  teacher_grade: number | null;
  teacher_class: number | null;
}): MemberFieldsValue {
  return {
    userType: p.user_type ?? "",
    realName: p.real_name ?? "",
    school: p.school ?? "",
    grade: p.grade?.toString() ?? "",
    classNo: p.class_no?.toString() ?? "",
    studentNo: p.student_no?.toString() ?? "",
    teacherRole: p.teacher_role ?? "",
    teacherGrade: p.teacher_grade?.toString() ?? "",
    teacherClass: p.teacher_class?.toString() ?? "",
  };
}

const TEACHER_ROLE_LABEL: Record<TeacherRole, string> = {
  homeroom: "담임",
  subject: "교과",
  homeroom_subject: "담임·교과",
};

const num = (s: string): number | null => {
  const n = s.trim() === "" ? NaN : Number(s.trim());
  return Number.isFinite(n) ? n : null;
};

/** 화면에서 막을 수 있게 채워야 할 값이 다 있는지 확인 (없으면 이유를 돌려줌) */
export function memberFieldsProblem(v: MemberFieldsValue): string {
  if (!v.userType) return "학생인지, 학부모인지, 교사인지 골라 주세요.";
  if (v.userType === "student") {
    if (v.realName.trim().length < 2) return "이름을 입력해 주세요.";
    if (v.school.trim().length < 2) return "학교를 입력해 주세요.";
    if (!v.grade || !v.classNo || !v.studentNo) return "학년·반·번호를 모두 입력해 주세요.";
  } else if (v.userType === "teacher") {
    if (v.realName.trim().length < 2) return "이름을 입력해 주세요.";
    if (v.school.trim().length < 2) return "학교를 입력해 주세요.";
    if (!v.teacherRole) return "담당(담임/교과)을 골라 주세요.";
    if ((v.teacherRole === "homeroom" || v.teacherRole === "homeroom_subject") && (!v.teacherGrade || !v.teacherClass))
      return "담임을 맡은 학년·반을 입력해 주세요.";
  }
  return "";
}

export function memberFieldsToInput(v: MemberFieldsValue): MemberProfileInput {
  const userType = v.userType as UserType;
  if (userType === "student") {
    return {
      user_type: userType,
      real_name: v.realName.trim(),
      school: v.school.trim(),
      grade: num(v.grade),
      class_no: num(v.classNo),
      student_no: num(v.studentNo),
      teacher_role: null,
      teacher_grade: null,
      teacher_class: null,
    };
  }
  if (userType === "teacher") {
    const includesHomeroom = v.teacherRole === "homeroom" || v.teacherRole === "homeroom_subject";
    return {
      user_type: userType,
      real_name: v.realName.trim(),
      school: v.school.trim(),
      teacher_role: (v.teacherRole || null) as TeacherRole | null,
      teacher_grade: includesHomeroom ? num(v.teacherGrade) : null,
      teacher_class: includesHomeroom ? num(v.teacherClass) : null,
      grade: null,
      class_no: null,
      student_no: null,
    };
  }
  // parent
  return {
    user_type: "parent",
    school: v.school.trim() || null,
    real_name: null,
    grade: null,
    class_no: null,
    student_no: null,
    teacher_role: null,
    teacher_grade: null,
    teacher_class: null,
  };
}

const TYPE_CARDS: { value: UserType; label: string; desc: string }[] = [
  { value: "student", label: "학생", desc: "대학 정보를 찾아보는 학생" },
  { value: "parent", label: "학부모", desc: "자녀의 진학을 돕는 학부모" },
  { value: "teacher", label: "선생님", desc: "진학 지도를 하는 교사" },
];

const SMALL_INPUT = cx(INPUT, "h-11");

export function MemberTypeChooser({
  value,
  onChange,
}: {
  value: UserType | "";
  onChange: (v: UserType) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {TYPE_CARDS.map((c) => (
        <label
          key={c.value}
          className={cx(
            "flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center",
            value === c.value ? "border-brand-400 bg-brand-50 text-brand-800" : "border-gray-200 text-gray-700 hover:bg-gray-50",
          )}
        >
          <input
            type="radio"
            name="member-user-type"
            value={c.value}
            checked={value === c.value}
            onChange={() => onChange(c.value)}
            className="accent-brand-500"
          />
          <span className="text-[15px] font-bold">{c.label}</span>
          <span className="text-[12px] leading-tight text-gray-500">{c.desc}</span>
        </label>
      ))}
    </div>
  );
}

/** 구분에 따른 입력 항목 (이름·학교·학년반번호 / 담당·학년반). 학부모는 자녀 학교(선택)만 보여줍니다. */
export function MemberDetailFields({
  value,
  onChange,
}: {
  value: MemberFieldsValue;
  onChange: (patch: Partial<MemberFieldsValue>) => void;
}) {
  if (!value.userType) return null;

  if (value.userType === "parent") {
    return (
      <div className="mt-4">
        <label htmlFor="member-school" className="text-[14px] font-semibold text-gray-800">
          자녀 학교 <span className="font-normal text-gray-400">(선택)</span>
        </label>
        <input
          id="member-school"
          value={value.school}
          onChange={(e) => onChange({ school: e.target.value })}
          maxLength={50}
          placeholder="예: 한빛고등학교"
          className={cx(SMALL_INPUT, "mt-1.5")}
        />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="member-real-name" className="text-[14px] font-semibold text-gray-800">
            이름(실명)
          </label>
          <input
            id="member-real-name"
            value={value.realName}
            onChange={(e) => onChange({ realName: e.target.value })}
            maxLength={20}
            autoComplete="off"
            className={cx(SMALL_INPUT, "mt-1.5")}
          />
        </div>
        <div>
          <label htmlFor="member-school" className="text-[14px] font-semibold text-gray-800">
            학교
          </label>
          <input
            id="member-school"
            value={value.school}
            onChange={(e) => onChange({ school: e.target.value })}
            maxLength={50}
            placeholder="예: 한빛고등학교"
            className={cx(SMALL_INPUT, "mt-1.5")}
          />
        </div>
      </div>

      {value.userType === "student" ? (
        <div className="grid grid-cols-3 gap-3">
          <NumField id="member-grade" label="학년" value={value.grade} max={6} onChange={(v) => onChange({ grade: v })} />
          <NumField id="member-class" label="반" value={value.classNo} max={30} onChange={(v) => onChange({ classNo: v })} />
          <NumField id="member-no" label="번호" value={value.studentNo} max={60} onChange={(v) => onChange({ studentNo: v })} />
        </div>
      ) : (
        <div>
          <fieldset>
            <legend className="text-[14px] font-semibold text-gray-800">담당</legend>
            <div className="mt-1.5 flex gap-2">
              {(Object.keys(TEACHER_ROLE_LABEL) as TeacherRole[]).map((r) => (
                <label
                  key={r}
                  className={cx(
                    "flex flex-1 cursor-pointer items-center justify-center rounded-xl border px-2 py-2.5 text-[14px] font-semibold",
                    value.teacherRole === r ? "border-brand-400 bg-brand-50 text-brand-800" : "border-gray-200 text-gray-700 hover:bg-gray-50",
                  )}
                >
                  <input
                    type="radio"
                    name="member-teacher-role"
                    value={r}
                    checked={value.teacherRole === r}
                    onChange={() => onChange({ teacherRole: r })}
                    className="sr-only"
                  />
                  {TEACHER_ROLE_LABEL[r]}
                </label>
              ))}
            </div>
          </fieldset>
          {(value.teacherRole === "homeroom" || value.teacherRole === "homeroom_subject") && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <NumField id="member-teacher-grade" label="담임 학년" value={value.teacherGrade} max={6} onChange={(v) => onChange({ teacherGrade: v })} />
              <NumField id="member-teacher-class" label="담임 반" value={value.teacherClass} max={30} onChange={(v) => onChange({ teacherClass: v })} />
            </div>
          )}
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] leading-5 text-amber-950">
            선생님 계정은 관리자가 확인한 뒤 &lsquo;선생님&rsquo; 표시와 선생님 기능이 열려요. 확인 전에는 일반 회원처럼 이용할 수 있어요.
          </p>
        </div>
      )}

      <p className="text-[12px] leading-5 text-gray-500">
        학급·수업 단위 기능을 준비하기 위해 모으는 정보예요. 본인과 관리자만 볼 수 있고, 다른 사람에게는 전혀 보이지 않아요.
      </p>
    </div>
  );
}

function NumField({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[14px] font-semibold text-gray-800">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(SMALL_INPUT, "mt-1.5")}
      />
    </div>
  );
}
