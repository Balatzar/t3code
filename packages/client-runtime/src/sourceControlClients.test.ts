import {
  type ChangeRequestCheckoutInput,
  UNKNOWN_SOURCE_CONTROL_CLIENT,
} from "@t3tools/source-control-core/client/definition";
import { describe, expect, it } from "vite-plus/test";

import { sourceControlClients } from "./sourceControlClients.ts";

describe("sourceControlClients", () => {
  it("reads a missing kind as GitHub and an unshipped kind as the generic host", () => {
    expect(sourceControlClients.get(undefined).kind).toBe("github");
    expect(sourceControlClients.get(null).kind).toBe("github");
    expect(sourceControlClients.get("unknown")).toBe(UNKNOWN_SOURCE_CONTROL_CLIENT);
    expect(sourceControlClients.get("forkhost")).toBe(UNKNOWN_SOURCE_CONTROL_CLIENT);
    expect(sourceControlClients.find("forkhost")).toBeUndefined();
    expect(UNKNOWN_SOURCE_CONTROL_CLIENT.changeRequest).toEqual({
      shortLabel: "change request",
      singular: "change request",
    });
  });

  it("attributes change request URLs by their path shape", () => {
    const kindOf = (url: string) => sourceControlClients.findByChangeRequestUrl(url)?.kind;
    expect(kindOf("https://github.com/acme/web/pull/7")).toBe("github");
    expect(kindOf("https://gitlab.example/group/sub/web/-/merge_requests/7")).toBe("gitlab");
    expect(kindOf("https://codeberg.org/acme/web/pulls/7")).toBe("forgejo");
    // GitCafe shares Forgejo's `/pulls/` shape, so only its own hosts read as GitCafe.
    expect(kindOf("https://git.cafe/acme/web/pulls/7")).toBe("gitcafe");
    expect(kindOf("https://staging.git.cafe/acme/web/pulls/7")).toBe("gitcafe");
    expect(kindOf("https://git.cafe.example/acme/web/pulls/7")).toBe("forgejo");
    expect(kindOf("https://bitbucket.org/acme/web/pull-requests/7")).toBe("bitbucket");
    expect(kindOf("https://dev.azure.com/org/project/_git/web/pullrequest/7")).toBe("azure-devops");
    expect(kindOf("https://example.com/acme/web/issues/7")).toBeUndefined();
  });

  it("attributes only public hostnames that name exactly one host", () => {
    expect(sourceControlClients.findByPublicHost("GitHub.com")?.kind).toBe("github");
    expect(sourceControlClients.findByPublicHost("gitlab.com")?.kind).toBe("gitlab");
    expect(sourceControlClients.findByPublicHost("codeberg.org")).toBeUndefined();
    expect(sourceControlClients.findByPublicHost("dev.azure.com")).toBeUndefined();
    expect(sourceControlClients.findByPublicHost("git.cafe")).toBeUndefined();
  });

  it("builds each host's checkout command", () => {
    const checkout = (kind: string, input: ChangeRequestCheckoutInput) =>
      sourceControlClients.get(kind).checkoutCommand(input);
    expect(checkout("github", { number: 42, headBranch: "" })).toBe("gh pr checkout 42");
    expect(checkout("gitlab", { number: 42, headBranch: "" })).toBe("glab mr checkout 42");
    expect(checkout("azure-devops", { number: 42, headBranch: "" })).toBe(
      "az repos pr checkout --id 42",
    );
    expect(checkout("gitcafe", { number: 42, headBranch: "" })).toBe("cafe pr checkout 42");
    expect(checkout("unknown", { number: 42, headBranch: "feature" })).toBeNull();
    expect(checkout("forgejo", { number: 42, headBranch: "feature" })).toBeNull();
    expect(
      checkout("forgejo", {
        number: 42,
        headBranch: "feature",
        repositoryUrl: "https://forgejo.local/maria/repo'$(echo nope)",
      }),
    ).toBe(
      "git fetch 'https://forgejo.local/maria/repo'\\''$(echo nope)' refs/pull/42/head && git checkout -B pulls/42 FETCH_HEAD",
    );
    expect(
      checkout("bitbucket", {
        number: 42,
        headBranch: "feature/checkout",
        headRepositoryNameWithOwner: "maria/t3code",
      }),
    ).toBe(
      "git clone --single-branch --branch feature/checkout https://bitbucket.org/maria/t3code.git t3code-pr-42",
    );
    expect(
      checkout("bitbucket", {
        number: 42,
        headBranch: "feature;rm -rf /",
        headRepositoryNameWithOwner: "maria/t3code",
      }),
    ).toBeNull();
  });

  it("links GitHub author profiles but not bots, and no other host's", () => {
    const github = sourceControlClients.get("github");
    expect(github.authorProfileUrl("octo cat", "https://ghe.example/acme/web")).toBe(
      "https://ghe.example/octo%20cat",
    );
    expect(github.authorProfileUrl("renovate[bot]", "https://github.com/acme/web")).toBeNull();
    expect(
      sourceControlClients.get("gitlab").authorProfileUrl("octocat", "https://gitlab.com/a/b"),
    ).toBeNull();
  });

  it("asks only Forgejo for a summary when requesting changes", () => {
    expect(sourceControlClients.get("forgejo").reviewSummaryRequired("request-changes")).toBe(true);
    expect(sourceControlClients.get("forgejo").reviewSummaryRequired("approve")).toBe(false);
    expect(sourceControlClients.get("github").reviewSummaryRequired("request-changes")).toBe(false);
  });
});

describe("reference autolinks", () => {
  it("link only under GitHub's repository URL", () => {
    expect(
      sourceControlClients.get("github").referenceAutolinkRepositoryUrl("https://github.com/a/b"),
    ).toBe("https://github.com/a/b");
    expect(
      sourceControlClients.get("gitlab").referenceAutolinkRepositoryUrl("https://gitlab.com/a/b"),
    ).toBeNull();
  });
});

describe("change request URLs", () => {
  const url = (
    kind: string,
    input: Parameters<typeof UNKNOWN_SOURCE_CONTROL_CLIENT.changeRequestUrl>[0],
  ) => sourceControlClients.get(kind).changeRequestUrl(input);
  const at = { host: "code.example", repository: "acme/web", number: 7 };

  it("builds each host's path", () => {
    expect(url("github", at)).toBe("https://code.example/acme/web/pull/7");
    expect(url("gitlab", at)).toBe("https://code.example/acme/web/-/merge_requests/7");
    expect(url("bitbucket", at)).toBe("https://code.example/acme/web/pull-requests/7");
    expect(url("gitcafe", { ...at, host: "git.cafe" })).toBe("https://git.cafe/acme/web/pulls/7");
    expect(
      url("azure-devops", {
        host: "ssh.dev.azure.com",
        repository: "v3/org/project/web",
        number: 7,
      }),
    ).toBe("https://dev.azure.com/org/project/_git/web/pullrequest/7");
    expect(url("unknown", at)).toBeNull();
  });

  it("puts Forgejo pages on the server's web origin", () => {
    expect(url("forgejo", { ...at, webUrl: "https://code.example:3000/git/acme/web/" })).toBe(
      "https://code.example:3000/git/acme/web/pulls/7",
    );
    expect(url("forgejo", { ...at, remoteUrl: "http://code.example:3000/acme/web.git" })).toBe(
      "http://code.example:3000/acme/web/pulls/7",
    );
    expect(url("forgejo", { ...at, remoteUrl: "git@code.example:acme/web.git" })).toBe(
      "https://code.example/acme/web/pulls/7",
    );
    expect(url("forgejo", { ...at, remoteUrl: "https://elsewhere.example/acme/web.git" })).toBe(
      "https://code.example/acme/web/pulls/7",
    );
  });
});

describe("reference parsing", () => {
  const argument = (kind: string, input: string) =>
    sourceControlClients.get(kind).checkoutCommandArgument(input);

  it("reads each host's checkout command for its argument", () => {
    expect(argument("github", "gh pr checkout #7")).toBe("#7");
    expect(argument("gitlab", "glab mr checkout 5")).toBe("5");
    expect(argument("forgejo", "tea pulls checkout 4")).toBe("4");
    expect(argument("azure-devops", "az repos pr checkout --remote-name origin -i 9")).toBe("9");
    expect(argument("azure-devops", "az repos pr checkout --id=11")).toBe("11");
    expect(argument("github", "glab mr checkout 5")).toBeNull();
    expect(argument("bitbucket", "gh pr checkout 5")).toBeNull();
  });

  it("accepts only each host's own change request URLs as references", () => {
    const accepts = (kind: string, url: string) =>
      sourceControlClients.get(kind).isChangeRequestReference(url);
    expect(accepts("github", "https://github.com/a/b/pull/1")).toBe(true);
    expect(accepts("github", "https://ghe.example/a/b/pull/1")).toBe(false);
    expect(accepts("gitlab", "https://gl.gitlab.example/g/p/-/merge_requests/3")).toBe(true);
    expect(accepts("forgejo", "http://forge.local:3000/a/b/pulls/2")).toBe(true);
    expect(accepts("azure-devops", "https://o.visualstudio.com/p/_git/r/pullrequest/5")).toBe(true);
    expect(accepts("azure-devops", "https://dev.azure.com/o/p/r/pullrequest/5")).toBe(false);
  });
});

describe("project matching", () => {
  const identity = (canonicalKey: string, extra: object = {}) => ({
    canonicalKey,
    locator: {
      source: "git-remote" as const,
      remoteName: "origin",
      remoteUrl: `git@${canonicalKey}.git`,
    },
    ...extra,
  });

  it("matches a link to its repository by full path and host", () => {
    const gitlab = sourceControlClients.get("gitlab");
    const checkout = identity("gitlab.com/group/sub/web", { displayName: "group/sub/web" });
    const link = { host: "gitlab.com", repository: "group/sub/web", number: 1 };
    expect(gitlab.isChangeRequestInRepository(checkout, link)).toBe(true);
    expect(gitlab.isChangeRequestInRepository(checkout, { ...link, host: "gitlab.example" })).toBe(
      false,
    );
    expect(gitlab.canReadChangeRequestOnHost(checkout, { ...link, repository: "other/x" })).toBe(
      true,
    );
  });

  it("keeps Forgejo servers on one hostname apart by port and mount path", () => {
    const forgejo = sourceControlClients.get("forgejo");
    const mounted = identity("forge.example/acme/web", {
      webUrl: "https://forge.example:3000/git/acme/web",
      locator: {
        source: "git-remote" as const,
        remoteName: "origin",
        remoteUrl: "https://forge.example:3000/git/acme/web.git",
      },
    });
    const link = {
      host: "forge.example",
      authority: "forge.example:3000",
      repository: "git/acme/web",
      number: 1,
    };
    expect(forgejo.isChangeRequestInRepository(mounted, link)).toBe(true);
    expect(
      forgejo.isChangeRequestInRepository(mounted, { ...link, authority: "forge.example:4000" }),
    ).toBe(false);
    expect(
      forgejo.canReadChangeRequestOnHost(mounted, { ...link, repository: "git/other/x" }),
    ).toBe(true);
    expect(
      forgejo.canReadChangeRequestOnHost(mounted, { ...link, repository: "elsewhere/x/y" }),
    ).toBe(false);
    expect(forgejo.changeRequestUrlHost(new URL("https://forge.example:3000/a/b/pulls/1"))).toBe(
      "forge.example:3000",
    );
  });

  it("matches Azure across URL spellings and never lends host-wide reads", () => {
    const azure = sourceControlClients.get("azure-devops");
    const checkout = identity("ssh.dev.azure.com/v3/org/project/web");
    const link = { host: "dev.azure.com", repository: "org/project/_git/web", number: 1 };
    expect(azure.isChangeRequestInRepository(checkout, link)).toBe(true);
    expect(azure.canReadChangeRequestOnHost(checkout, link)).toBe(false);
    expect(azure.checkoutChangeRequestHost(checkout)).toBeNull();
  });

  it("fills in a missing host from a GitHub checkout only", () => {
    expect(
      sourceControlClients.get("github").checkoutChangeRequestHost(identity("ghe.example/a/b")),
    ).toBe("ghe.example");
    expect(
      sourceControlClients.get("gitlab").checkoutChangeRequestHost(identity("gitlab.com/a/b")),
    ).toBeNull();
  });
});
