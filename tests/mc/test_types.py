"""Unit tests for mc.types — ClaudeCodeOpts and related dataclasses (CC-1)."""

from __future__ import annotations

import pytest

from mc.types import AgentData, ClaudeCodeOpts


class TestClaudeCodeOpts:
    """Tests for the ClaudeCodeOpts dataclass."""

    def test_default_values(self) -> None:
        opts = ClaudeCodeOpts()
        assert opts.max_budget_usd is None
        assert opts.max_turns is None
        assert opts.permission_mode == "acceptEdits"
        assert opts.allowed_tools is None
        assert opts.disallowed_tools is None

    def test_custom_values(self) -> None:
        opts = ClaudeCodeOpts(
            max_budget_usd=20.0,
            max_turns=100,
            permission_mode="bypassPermissions",
            allowed_tools=["Bash", "Edit", "Read"],
            disallowed_tools=["WebFetch"],
        )
        assert opts.max_budget_usd == 20.0
        assert opts.max_turns == 100
        assert opts.permission_mode == "bypassPermissions"
        assert opts.allowed_tools == ["Bash", "Edit", "Read"]
        assert opts.disallowed_tools == ["WebFetch"]

    def test_partial_values(self) -> None:
        opts = ClaudeCodeOpts(max_budget_usd=5.0)
        assert opts.max_budget_usd == 5.0
        assert opts.max_turns is None
        assert opts.permission_mode == "acceptEdits"

    def test_max_turns_only(self) -> None:
        opts = ClaudeCodeOpts(max_turns=50)
        assert opts.max_budget_usd is None
        assert opts.max_turns == 50

    def test_allowed_tools_empty_list(self) -> None:
        opts = ClaudeCodeOpts(allowed_tools=[])
        assert opts.allowed_tools == []

    def test_disallowed_tools_multiple(self) -> None:
        opts = ClaudeCodeOpts(disallowed_tools=["WebFetch", "Bash"])
        assert opts.disallowed_tools == ["WebFetch", "Bash"]


class TestAgentDataBackendFields:
    """Tests for backend and claude_code_opts fields on AgentData."""

    def test_agent_data_default_backend(self) -> None:
        agent = AgentData(name="test-agent", display_name="Test Agent", role="Tester")
        assert agent.backend == "nanobot"
        assert agent.claude_code_opts is None

    def test_agent_data_claude_code_backend(self) -> None:
        opts = ClaudeCodeOpts(max_budget_usd=10.0, max_turns=30)
        agent = AgentData(
            name="cc-agent",
            display_name="CC Agent",
            role="Claude Code Agent",
            backend="claude-code",
            claude_code_opts=opts,
        )
        assert agent.backend == "claude-code"
        assert agent.claude_code_opts is opts
        assert agent.claude_code_opts.max_budget_usd == 10.0
        assert agent.claude_code_opts.max_turns == 30

    def test_agent_data_nanobot_backend_explicit(self) -> None:
        agent = AgentData(
            name="nano-agent",
            display_name="Nano Agent",
            role="Nanobot Agent",
            backend="nanobot",
        )
        assert agent.backend == "nanobot"
        assert agent.claude_code_opts is None

    def test_agent_data_claude_code_opts_none_with_claude_code_backend(self) -> None:
        """Backend can be set to claude-code without opts (opts is optional)."""
        agent = AgentData(
            name="cc-agent",
            display_name="CC Agent",
            role="Claude Code Agent",
            backend="claude-code",
            claude_code_opts=None,
        )
        assert agent.backend == "claude-code"
        assert agent.claude_code_opts is None
