import { Plus } from "lucide-react";
import { PageTitle } from "@/components/admin/page-title";
import { Card } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth";
import { saveTeamMember } from "@/lib/actions/content";
import { getTeamMembers } from "@/lib/data";

export default async function TeamMembersPage() {
  await requireSuperAdmin();
  const members = await getTeamMembers();

  return (
    <>
      <PageTitle title="Team Members" subtitle="Public convenors and executive team" />
      <Card className="mb-5 p-5">
        <form action={saveTeamMember} className="grid gap-3 md:grid-cols-[1fr_1fr_120px_1fr_auto]">
          <input name="name" required placeholder="Name" className="h-11 rounded-xl border border-border px-3" />
          <input name="position" required placeholder="Position" className="h-11 rounded-xl border border-border px-3" />
          <input name="display_order" type="number" defaultValue={0} className="h-11 rounded-xl border border-border px-3" />
          <input name="photo_url" type="url" placeholder="Photo URL" className="h-11 rounded-xl border border-border px-3" />
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white">
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => (
          <Card key={member.id} className="p-5 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-lg font-semibold text-primary">
              {member.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
            </div>
            <div className="mt-3 font-semibold">{member.name}</div>
            <div className="text-sm text-muted">{member.position}</div>
            <div className="mt-2 text-xs text-muted">Display order {member.display_order}</div>
          </Card>
        ))}
      </div>
    </>
  );
}
