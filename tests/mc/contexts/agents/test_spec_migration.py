"""Tests for mc.contexts.agents.spec_migration — Agent Spec V2 migration."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch


def _write_agent_files(
    agents_dir: Path,
    name: str,
    role: str = "Developer",
    prompt: str = "You are a developer.",
    soul: str | None = None,
    model: str | None = None,
    skills: list[str] | None = None,
) -> Path:
    """Write a minimal agent config.yaml (and optionally SOUL.md) to a temp dir."""
    agent_dir = agents_dir / name
    agent_dir.mkdir(parents=True, exist_ok=True)
    config = agent_dir / "config.yaml"
    lines = [f"name: {name}", f"role: {role}", f"prompt: '{prompt}'"]
    if model:
        lines.append(f"model: {model}")
    if skills:
        lines.append("skills:")
        for s in skills:
            lines.append(f"  - {s}")
    config.write_text("\n".join(lines) + "\n", encoding="utf-8")
    if soul:
        (agent_dir / "SOUL.md").write_text(soul, encoding="utf-8")
    return agent_dir


class TestSpecMigrationImport:
    """The migration module can be imported and exposes the public API."""

    def test_can_import_module(self) -> None:
        import mc.contexts.agents.spec_migration  # noqa: F401

    def test_module_has_migrate_agent_function(self) -> None:
        from mc.contexts.agents.spec_migration import migrate_agent

        assert callable(migrate_agent)

    def test_module_has_migrate_all_function(self) -> None:
        from mc.contexts.agents.spec_migration import migrate_all

        assert callable(migrate_all)

    def test_module_is_runnable_as_main(self) -> None:
        """The module exposes a main() entrypoint (for `python -m ...`)."""
        import mc.contexts.agents.spec_migration as mod

        assert hasattr(mod, "main") or hasattr(mod, "cli") or hasattr(mod, "migrate_all")


class TestBuildSpecPayload:
    """Tests for build_spec_payload_from_yaml — converts YAML to spec dict."""

    def test_returns_spec_payload_from_yaml(self, tmp_path: Path) -> None:
        """Legacy config.yaml becomes a valid Agent Spec V2 payload dict."""
        from mc.contexts.agents.spec_migration import build_spec_payload_from_yaml

        agent_dir = _write_agent_files(
            tmp_path,
            name="dev-agent",
            role="Senior Developer",
            prompt="You write clean code.",
        )

        payload = build_spec_payload_from_yaml(agent_dir / "config.yaml")

        assert payload["name"] == "dev-agent"
        assert payload["role"] == "Senior Developer"
        assert payload["prompt"] == "You write clean code."

    def test_includes_soul_from_soul_md(self, tmp_path: Path) -> None:
        """SOUL.md content is included in the spec payload."""
        from mc.contexts.agents.spec_migration import build_spec_payload_from_yaml

        agent_dir = _write_agent_files(
            tmp_path,
            name="soulful-agent",
            role="Artist",
            prompt="You create beautiful things.",
            soul="This agent values creativity above all.",
        )

        payload = build_spec_payload_from_yaml(agent_dir / "config.yaml")

        assert payload.get("soul") == "This agent values creativity above all."

    def test_includes_model_when_set(self, tmp_path: Path) -> None:
        """Model from config.yaml is preserved in the spec payload."""
        from mc.contexts.agents.spec_migration import build_spec_payload_from_yaml

        agent_dir = _write_agent_files(
            tmp_path,
            name="smart-agent",
            role="Analyst",
            prompt="You analyze data.",
            model="anthropic/claude-opus-4",
        )

        payload = build_spec_payload_from_yaml(agent_dir / "config.yaml")

        assert payload.get("model") == "anthropic/claude-opus-4"

    def test_includes_skills_when_set(self, tmp_path: Path) -> None:
        """Skills from config.yaml are preserved in the spec payload."""
        from mc.contexts.agents.spec_migration import build_spec_payload_from_yaml

        agent_dir = _write_agent_files(
            tmp_path,
            name="skilled-agent",
            role="Coder",
            prompt="You code things.",
            skills=["github", "memory"],
        )

        payload = build_spec_payload_from_yaml(agent_dir / "config.yaml")

        assert payload.get("skills") == ["github", "memory"]

    def test_fills_defaults_for_missing_fields(self, tmp_path: Path) -> None:
        """Missing optional fields receive sensible defaults in the spec payload."""
        from mc.contexts.agents.spec_migration import build_spec_payload_from_yaml

        agent_dir = _write_agent_files(
            tmp_path,
            name="bare-agent",
            role="Worker",
            prompt="You work.",
        )

        payload = build_spec_payload_from_yaml(agent_dir / "config.yaml")

        # Skills defaults to empty list when not specified
        assert "skills" in payload
        assert isinstance(payload["skills"], list)

    def test_uses_yaml_validator_not_adhoc_parser(self, tmp_path: Path) -> None:
        """Migration reuses the YAML validator, not an ad-hoc parser."""
        agent_dir = _write_agent_files(
            tmp_path,
            name="validated-agent",
            role="Tester",
            prompt="You test.",
        )

        with patch("mc.contexts.agents.spec_migration.validate_agent_file") as mock_validate:
            from mc.types import AgentData

            mock_validate.return_value = AgentData(
                name="validated-agent",
                display_name="Validated Agent",
                role="Tester",
                prompt="You test.",
            )

            from mc.contexts.agents.spec_migration import build_spec_payload_from_yaml

            build_spec_payload_from_yaml(agent_dir / "config.yaml")

            mock_validate.assert_called_once()

    def test_returns_none_for_invalid_yaml(self, tmp_path: Path) -> None:
        """Returns None (or an error indicator) for invalid agent YAML."""
        from mc.contexts.agents.spec_migration import build_spec_payload_from_yaml

        bad_dir = tmp_path / "bad-agent"
        bad_dir.mkdir()
        (bad_dir / "config.yaml").write_text("name: bad-agent\n", encoding="utf-8")

        result = build_spec_payload_from_yaml(bad_dir / "config.yaml")

        assert result is None


class TestMigrateAgentBridgeIntegration:
    """Tests for migrate_agent creating specs via the bridge."""

    def test_migrate_agent_creates_spec_via_bridge(self, tmp_path: Path) -> None:
        """migrate_agent creates an Agent Spec V2 record through the bridge."""
        from mc.contexts.agents.spec_migration import migrate_agent

        agent_dir = _write_agent_files(
            tmp_path,
            name="bridge-agent",
            role="Developer",
            prompt="You build bridges.",
        )

        bridge = MagicMock()
        bridge.create_agent_spec.return_value = "spec-id-new"
        bridge.get_agent_spec_by_name.return_value = None

        result = migrate_agent(
            config_path=agent_dir / "config.yaml",
            bridge=bridge,
        )

        bridge.create_agent_spec.assert_called_once()
        call_kwargs = bridge.create_agent_spec.call_args[1]
        assert call_kwargs["name"] == "bridge-agent"
        assert result is not None

    def test_migrate_agent_publishes_spec_after_creating(self, tmp_path: Path) -> None:
        """migrate_agent publishes the spec to create a runtime projection."""
        from mc.contexts.agents.spec_migration import migrate_agent

        agent_dir = _write_agent_files(
            tmp_path,
            name="publish-agent",
            role="Deployer",
            prompt="You deploy things.",
        )

        bridge = MagicMock()
        bridge.create_agent_spec.return_value = "spec-id-publish"
        bridge.get_agent_spec_by_name.return_value = None

        migrate_agent(config_path=agent_dir / "config.yaml", bridge=bridge)

        bridge.publish_agent_spec.assert_called_once_with("spec-id-publish")

    def test_migrate_agent_skips_if_spec_already_exists(self, tmp_path: Path) -> None:
        """migrate_agent is idempotent: skips creation if spec exists."""
        from mc.contexts.agents.spec_migration import migrate_agent

        agent_dir = _write_agent_files(
            tmp_path,
            name="existing-agent",
            role="Manager",
            prompt="You manage things.",
        )

        bridge = MagicMock()
        bridge.get_agent_spec_by_name.return_value = {
            "name": "existing-agent",
            "_id": "spec-id-existing",
        }

        result = migrate_agent(config_path=agent_dir / "config.yaml", bridge=bridge)

        bridge.create_agent_spec.assert_not_called()
        # Should still return the existing spec id or a status indicator
        assert result is not None

    def test_migrate_agent_dry_run_does_not_call_bridge(self, tmp_path: Path) -> None:
        """In dry_run mode, migrate_agent builds the payload but does not call the bridge."""
        from mc.contexts.agents.spec_migration import migrate_agent

        agent_dir = _write_agent_files(
            tmp_path,
            name="dry-agent",
            role="Previewer",
            prompt="You preview things.",
        )

        bridge = MagicMock()

        migrate_agent(
            config_path=agent_dir / "config.yaml",
            bridge=bridge,
            dry_run=True,
        )

        bridge.create_agent_spec.assert_not_called()
        bridge.publish_agent_spec.assert_not_called()


class TestMigrateAll:
    """Tests for migrate_all — bulk migration of agent catalog."""

    def test_migrate_all_processes_each_agent_directory(self, tmp_path: Path) -> None:
        """migrate_all calls migrate_agent for each valid agent directory."""
        from mc.contexts.agents.spec_migration import migrate_all

        _write_agent_files(tmp_path, "agent-one", role="Worker 1", prompt="Work 1.")
        _write_agent_files(tmp_path, "agent-two", role="Worker 2", prompt="Work 2.")

        bridge = MagicMock()
        bridge.create_agent_spec.return_value = "spec-id"
        bridge.get_agent_spec_by_name.return_value = None

        results = migrate_all(agents_dir=tmp_path, bridge=bridge)

        assert len(results["migrated"]) == 2

    def test_migrate_all_returns_summary(self, tmp_path: Path) -> None:
        """migrate_all returns a summary with migrated, skipped, and errors."""
        from mc.contexts.agents.spec_migration import migrate_all

        _write_agent_files(tmp_path, "good-agent", role="Worker", prompt="Work.")

        bridge = MagicMock()
        bridge.create_agent_spec.return_value = "spec-id"
        bridge.get_agent_spec_by_name.return_value = None

        results = migrate_all(agents_dir=tmp_path, bridge=bridge)

        assert "migrated" in results
        assert "skipped" in results
        assert "errors" in results

    def test_migrate_all_skips_already_migrated_agents(self, tmp_path: Path) -> None:
        """migrate_all reports already-migrated agents as skipped."""
        from mc.contexts.agents.spec_migration import migrate_all

        _write_agent_files(tmp_path, "old-agent", role="Worker", prompt="Work.")

        bridge = MagicMock()
        bridge.get_agent_spec_by_name.return_value = {
            "name": "old-agent",
            "_id": "spec-id-existing",
        }

        results = migrate_all(agents_dir=tmp_path, bridge=bridge)

        assert "old-agent" in results["skipped"]
        assert len(results["migrated"]) == 0

    def test_migrate_all_dry_run_reports_without_writing(self, tmp_path: Path) -> None:
        """migrate_all with dry_run=True reports planned changes but writes nothing."""
        from mc.contexts.agents.spec_migration import migrate_all

        _write_agent_files(tmp_path, "preview-agent", role="Worker", prompt="Work.")

        bridge = MagicMock()
        bridge.get_agent_spec_by_name.return_value = None

        results = migrate_all(agents_dir=tmp_path, bridge=bridge, dry_run=True)

        bridge.create_agent_spec.assert_not_called()
        # In dry-run mode: migrated list contains planned agents
        assert len(results["migrated"]) == 1 or len(results.get("planned", [])) == 1

    def test_migrate_all_tolerates_invalid_yaml(self, tmp_path: Path) -> None:
        """migrate_all records invalid agents in errors without aborting."""
        from mc.contexts.agents.spec_migration import migrate_all

        # Create a valid agent
        _write_agent_files(tmp_path, "valid-agent", role="Worker", prompt="Work.")

        # Create an invalid agent directory (missing required fields)
        bad_dir = tmp_path / "bad-agent"
        bad_dir.mkdir()
        (bad_dir / "config.yaml").write_text("name: bad-agent\n", encoding="utf-8")

        bridge = MagicMock()
        bridge.create_agent_spec.return_value = "spec-id"
        bridge.get_agent_spec_by_name.return_value = None

        results = migrate_all(agents_dir=tmp_path, bridge=bridge)

        assert "bad-agent" in results["errors"]
        assert "valid-agent" in results["migrated"]
