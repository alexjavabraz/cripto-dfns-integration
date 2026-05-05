// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ERC20Token
 * @notice Deployable ERC-20 token with configurable supply minted to owner on construction.
 */
contract ERC20Token is ERC20, Ownable {
    uint8 private immutable _decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 tokenDecimals,
        uint256 initialSupply,
        address owner
    ) ERC20(name, symbol) Ownable(owner) {
        _decimals = tokenDecimals;
        // initialSupply is in whole tokens; multiply by decimals
        _mint(owner, initialSupply * (10 ** tokenDecimals));
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
